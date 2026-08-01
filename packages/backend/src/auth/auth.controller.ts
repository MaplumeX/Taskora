import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  Res,
  Req,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import type { Response, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RT_COOKIE_NAME, COOKIE_OPTS } from './refresh-token.helpers';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, rt, user } = await this.authService.login(dto);
    res.cookie(RT_COOKIE_NAME, rt, COOKIE_OPTS);
    return { accessToken, user };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    // CSRF: reject cross-site requests
    const secFetchSite = req.headers['sec-fetch-site'];
    if (secFetchSite === 'cross-site') {
      throw new UnauthorizedException('Cross-site request not allowed');
    }

    const rt = req.cookies?.[RT_COOKIE_NAME];
    if (!rt) {
      res.clearCookie(RT_COOKIE_NAME, { path: '/api/v1/auth' });
      throw new UnauthorizedException('No refresh token');
    }

    try {
      const { accessToken, user, newRt } = await this.authService.rotateRefreshToken(rt);
      res.cookie(RT_COOKIE_NAME, newRt, COOKIE_OPTS);
      return { accessToken, user };
    } catch {
      res.clearCookie(RT_COOKIE_NAME, { path: '/api/v1/auth' });
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rt = req.cookies?.[RT_COOKIE_NAME];
    await this.authService.revokeRefreshToken(rt);
    res.clearCookie(RT_COOKIE_NAME, { path: '/api/v1/auth' });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Request() req: { user: { id: string } }) {
    return this.authService.getMe(req.user.id);
  }
}
