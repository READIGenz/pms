"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
// src/prisma/prisma.service.ts
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let PrismaService = class PrismaService extends client_1.PrismaClient {
    get projectModuleSetting() {
        return this._projectModuleSetting;
    }
    set projectModuleSetting(value) {
        this._projectModuleSetting = value;
    }
    async onModuleInit() {
        await this.$connect();
        // ---- Global empty-string → null guard for optional-unique fields ----
        const toNullIfEmpty = (v) => typeof v === 'string' && v.trim() === '' ? null : v;
        // Model -> fields to coerce
        const COERCE_MAP = {
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
            const coercePayload = (data) => {
                if (!data)
                    return data;
                for (const key of fields) {
                    if (key in data) {
                        data[key] = toNullIfEmpty(data[key]);
                    }
                }
                return data;
            };
            if (params.action === 'upsert') {
                params.args.create = coercePayload(params.args.create);
                params.args.update = coercePayload(params.args.update);
            }
            else {
                params.args.data = coercePayload(params.args.data);
            }
            return next(params);
        });
    }
    async onModuleDestroy() { await this.$disconnect(); }
    async enableShutdownHooks(app) {
        process.on('beforeExit', async () => { await app.close(); });
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = __decorate([
    (0, common_1.Injectable)()
], PrismaService);
//# sourceMappingURL=prisma.service.js.map