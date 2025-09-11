/**
 * prisma.service.ts
 * -----------------
 * REMARK: Thin wrapper around PrismaClient so Nest can inject it.
 */
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {}
