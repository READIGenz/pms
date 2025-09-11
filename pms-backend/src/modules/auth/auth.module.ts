import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { PrismaService } from '../../common/prisma.service'; // adjust if needed

@Module({
  imports: [JwtModule.register({ global: true, secret: process.env.JWT_SECRET || 'devsecret' })],
  controllers: [AuthController],
  providers: [PrismaService],
})
export class AuthModule {}
