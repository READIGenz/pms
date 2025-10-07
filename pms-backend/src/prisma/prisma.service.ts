// src/prisma/prisma.service.ts
import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // ---- Global empty-string → null guard for optional-unique fields ----
    const toNullIfEmpty = (v: unknown) =>
      typeof v === 'string' && v.trim() === '' ? null : v;

    // Model -> fields to coerce
    const COERCE_MAP: Record<string, string[]> = {
      RefActivity: ['code'], // optional unique
      RefMaterial: ['code'], // optional unique
      // Add others if you introduce more optional-unique cols later
      Company: ['gstin', 'pan', 'cin', 'companyCode'], // if you want global safety too
      Project: ['code'], // optional unique in your schema
      User: ['email', 'code'], // both unique, email can be optional
    };

    this.$use(async (params, next) => {
      // Only care about create/update
      if (params.action !== 'create' && params.action !== 'update' && params.action !== 'upsert') {
        return next(params);
      }

      const model = params.model || '';
      const fields = COERCE_MAP[model];
      if (!fields?.length) {
        return next(params);
      }

      const coercePayload = (data: Record<string, any> | undefined) => {
        if (!data) return data;
        for (const key of fields) {
          if (key in data) {
            data[key] = toNullIfEmpty((data as any)[key]);
          }
        }
        return data;
      };

      if (params.action === 'upsert') {
        params.args.create = coercePayload(params.args.create);
        params.args.update = coercePayload(params.args.update);
      } else {
        params.args.data = coercePayload(params.args.data);
      }

      return next(params);
    });
  }

  async onModuleDestroy() { await this.$disconnect(); }
  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => { await app.close(); });
  }
}
