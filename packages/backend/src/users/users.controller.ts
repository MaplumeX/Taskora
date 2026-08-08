import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
  constructor(private readonly usersService: UsersService) {}

  @Put('me')
  updateProfile(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @Put('me/password')
  updatePassword(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdatePasswordDto,
  ) {
    return this.usersService.updatePassword(req.user.id, dto);
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
