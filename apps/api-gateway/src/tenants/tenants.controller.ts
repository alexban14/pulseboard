import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AuthService } from '../auth/auth.service.js';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyTenant(@Request() req: { user: { userId: string; email: string; tenantId: string; role: string } }) {
    const tenant = await this.authService.getTenant(req.user.tenantId);

    return {
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            plan: tenant.plan,
            status: tenant.status,
            createdAt: tenant.createdAt,
          }
        : null,
      user: {
        id: req.user.userId,
        email: req.user.email,
        role: req.user.role,
      },
    };
  }
}
