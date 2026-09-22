import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Req,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { isNonCookieClient, RT_COOKIE_NAME, COOKIE_OPTS } from '../auth/refresh-token.helpers';
import { UsersService } from './users.service';
import {
  UpdateProfileDto,
  UpdatePasswordDto,
  UpdatePreferencesDto,
  DeleteAccountDto,
} from './dto/users.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Put('me')
  updateProfile(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @Put('me/password')
  async updatePassword(
    @Request() req: { user: { id: string } },
    @Req() expressReq: ExpressRequest,
    @Body() dto: UpdatePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.usersService.updatePassword(req.user.id, dto);

    // The service just revoked every refresh token of this user; hand the
    // session that performed the change a fresh one so it survives. Same
    // transport split as login: cookie on web, body on desktop.
    const rt = await this.authService.issueRefreshToken(req.user.id);
    if (isNonCookieClient(expressReq)) {
      return { ...result, refreshToken: rt };
    }
    res.cookie(RT_COOKIE_NAME, rt, COOKIE_OPTS);
    return result;
  }

  @Put('me/preferences')
  updatePreferences(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(req.user.id, dto);
  }

  @Get('me/export')
  exportData(@Request() req: { user: { id: string } }) {
    return this.usersService.exportData(req.user.id);
  }

  @Delete('me')
  deleteAccount(
    @Request() req: { user: { id: string } },
    @Body() dto: DeleteAccountDto,
  ) {
    return this.usersService.deleteAccount(req.user.id, dto);
  }
}
