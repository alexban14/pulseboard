import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { tenants, tenantUsers } from '@pulseboard/shared-db';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly database: DatabaseService,
  ) {}

  private get db() {
    return this.database.db;
  }

  async register(
    email: string,
    password: string,
    tenantName: string,
    tenantSlug: string,
  ) {
    // Check for duplicate email across all tenants
    const existingUser = await this.db
      .select({ id: tenantUsers.id })
      .from(tenantUsers)
      .where(eq(tenantUsers.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      throw new ConflictException('A user with this email already exists');
    }

    // Check for duplicate tenant slug
    const existingTenant = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (existingTenant.length > 0) {
      throw new ConflictException('A tenant with this slug already exists');
    }

    // Create tenant
    const [tenant] = await this.db
      .insert(tenants)
      .values({
        name: tenantName,
        slug: tenantSlug,
      })
      .returning({ id: tenants.id });

    // Create admin user
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await this.db
      .insert(tenantUsers)
      .values({
        tenantId: tenant.id,
        email,
        name: email.split('@')[0],
        role: 'admin',
        passwordHash,
      })
      .returning({
        id: tenantUsers.id,
        email: tenantUsers.email,
        name: tenantUsers.name,
        role: tenantUsers.role,
      });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      expiresIn: 3600,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: tenant.id,
      },
    };
  }

  async login(email: string, password: string) {
    const [user] = await this.db
      .select()
      .from(tenantUsers)
      .where(eq(tenantUsers.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.db
      .update(tenantUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(tenantUsers.id, user.id));

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      expiresIn: 3600,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async validateUser(payload: JwtPayload) {
    const [user] = await this.db
      .select()
      .from(tenantUsers)
      .where(eq(tenantUsers.id, payload.sub))
      .limit(1);

    return user ?? null;
  }

  async getTenant(tenantId: string) {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    return tenant ?? null;
  }
}
