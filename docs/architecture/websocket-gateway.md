# WebSocket Gateway

The API Gateway includes a WebSocket gateway that provides real-time push
notifications to connected browser clients. It is **not a separate service** —
it runs inside the same NestJS process as the HTTP API.

## Why WebSocket

Polling works but wastes bandwidth and adds latency. WebSocket gives us:

- **Instant pipeline updates** — sync progress, completion, failures pushed live
- **NLQ token streaming** — LLM responses stream token-by-token (like ChatGPT)
- **Dashboard auto-refresh** — push cache invalidation when new data arrives
- **Alert notifications** — toast notifications the moment a threshold is breached
- **Schema discovery progress** — stream tables as they're discovered

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                       NATS JetStream                      │
│              (events from pipelines, services)             │
└────────────────────────────┬─────────────────────────────┘
                             │ subscribe
┌────────────────────────────▼─────────────────────────────┐
│                     API Gateway (NestJS)                   │
│                                                          │
│  ┌── HTTP Routes ──────────┐  ┌── WebSocket Gateway ──┐  │
│  │ REST API endpoints      │  │ Socket.IO server      │  │
│  │ /api/auth/*             │  │                       │  │
│  │ /api/connectors/*       │  │ JWT auth on handshake │  │
│  │ /api/tenants/*          │  │ Tenant-scoped rooms   │  │
│  │ /api/nlq/*              │  │ Event broadcasting    │  │
│  └─────────────────────────┘  └───────────┬───────────┘  │
└───────────────────────────────────────────┼──────────────┘
                                            │ push events
┌───────────────────────────────────────────▼──────────────┐
│                   Browser Clients                         │
│                   (Socket.IO client)                      │
│                                                          │
│  Tenant A room ──→ only sees Tenant A events             │
│  Tenant B room ──→ only sees Tenant B events             │
└──────────────────────────────────────────────────────────┘
```

## Technology Choice: Socket.IO

**Why Socket.IO over raw WebSocket:**

| Feature | Socket.IO | Raw WebSocket |
|---------|-----------|---------------|
| Auto-reconnect | Built-in with backoff | Manual implementation |
| Rooms (tenant isolation) | Built-in | Manual room management |
| Fallback to long-polling | Automatic | No fallback |
| Binary data support | Built-in | Manual |
| Namespaces | Built-in | Not available |
| NestJS integration | `@nestjs/websockets` native | Manual setup |

**Why not a separate service:** NestJS supports WebSocket gateways natively
in the same process via `@nestjs/websockets`. Adding a separate WS service
means more Docker containers, more networking, more deployment complexity —
all for something that handles <10K connections at our scale. Split later if
it becomes a bottleneck.

## Event Types

| Event | Direction | Payload | Source | Consumer |
|-------|-----------|---------|--------|----------|
| `sync:progress` | Server → Client | `{ connectorId, table, rowsSynced, totalRows, percent }` | Dagster pipeline via NATS | Source detail page |
| `sync:completed` | Server → Client | `{ connectorId, rowsSynced, durationMs }` | Dagster pipeline via NATS | Dashboard (cache invalidation) |
| `sync:failed` | Server → Client | `{ connectorId, error }` | Dagster pipeline via NATS | Source detail page, toast |
| `schema:discovered` | Server → Client | `{ connectorId, tableCount }` | Connector service | Source detail page |
| `nlq:token` | Server → Client | `{ conversationId, token, index }` | NLQ service (LLM stream) | NLQ input bar |
| `nlq:complete` | Server → Client | `{ conversationId, queryDefinition, chartType, title }` | NLQ service | NLQ input bar |
| `alert:triggered` | Server → Client | `{ alertId, metricName, value, threshold }` | Alert service via NATS | Toast notification |

## Tenant Isolation

Every connection is scoped to a tenant via Socket.IO rooms:

```
1. Client connects with JWT token
2. Gateway validates JWT, extracts tenantId
3. Socket joins room: `tenant:{tenantId}`
4. Events are broadcast to room only — never globally
5. No client can listen to another tenant's room
```

```typescript
// Server-side: NestJS WebSocket gateway
@WebSocketGateway({ cors: true })
export class RealtimeGateway implements OnGatewayConnection {
  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    const payload = this.jwtService.verify(token);
    client.join(`tenant:${payload.tenantId}`);
    client.data = { tenantId: payload.tenantId, userId: payload.sub };
  }

  pushToTenant(tenantId: string, event: string, data: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }
}
```

## NATS → WebSocket Bridge

The gateway subscribes to NATS topics and relays events to WebSocket rooms:

```typescript
// On service init, subscribe to NATS events
async onModuleInit() {
  const nc = await connect({ servers: this.natsUrl });

  // Pipeline events
  const sub = nc.subscribe('pipeline.>');
  for await (const msg of sub) {
    const event = JSON.parse(msg.data);
    this.pushToTenant(event.tenantId, msg.subject, event);
  }
}
```

NATS topic naming convention:
```
pipeline.sync.progress.{tenantId}.{connectorId}
pipeline.sync.completed.{tenantId}.{connectorId}
pipeline.sync.failed.{tenantId}.{connectorId}
nlq.token.{tenantId}.{conversationId}
nlq.complete.{tenantId}.{conversationId}
alert.triggered.{tenantId}.{alertId}
```

## Frontend Hook

```typescript
// src/lib/hooks/use-realtime-socket.ts
export function useRealtimeSocket() {
  const { token, tenant } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(WS_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [token]);

  const on = (event: string, handler: (data: any) => void) => {
    socketRef.current?.on(event, handler);
  };

  const off = (event: string, handler: (data: any) => void) => {
    socketRef.current?.off(event, handler);
  };

  return { isConnected, on, off };
}
```

**Usage in components:**
```typescript
// Dashboard: auto-refresh when sync completes
const { on } = useRealtimeSocket();
const queryClient = useQueryClient();

useEffect(() => {
  const handler = () => {
    queryClient.invalidateQueries({ queryKey: ['widget-data'] });
  };
  on('sync:completed', handler);
  return () => off('sync:completed', handler);
}, []);

// Source detail: live sync progress
on('sync:progress', ({ connectorId, percent, rowsSynced }) => {
  if (connectorId === currentConnectorId) {
    setProgress({ percent, rowsSynced });
  }
});
```

## Fallback: Polling

If WebSocket is unavailable (corporate proxies, strict firewalls), the
frontend falls back to TanStack Query polling:

```typescript
useQuery({
  queryKey: ['connector', connectorId, 'sync-runs'],
  refetchInterval: isConnected ? false : 30_000, // poll only if WS is down
});
```

The `isConnected` flag from `useRealtimeSocket()` controls this. When WS
is connected, polling is disabled. When WS drops, polling resumes at 30s.

## Connection Status Indicator

A small indicator in the sidebar shows the real-time connection status:

```
● Connected     (green dot — WebSocket active)
○ Reconnecting  (yellow dot — lost connection, retrying)
○ Offline       (gray dot — polling fallback active)
```

## Scaling Considerations

Socket.IO handles ~10K concurrent connections per process. At our target
scale (<1000 concurrent users across all tenants), a single gateway is
sufficient.

If we need to scale beyond that:
1. Run multiple API Gateway replicas
2. Add `@socket.io/redis-adapter` to sync rooms across processes
3. Redis pub/sub handles the fan-out between gateway instances
4. Sticky sessions via Traefik/Nginx (required for Socket.IO polling transport)
