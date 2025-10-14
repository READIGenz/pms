"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtAuthGuard = void 0;
// src/main.ts
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
let JwtAuthGuard = class JwtAuthGuard extends (0, passport_1.AuthGuard)('jwt') {
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)()
], JwtAuthGuard);
require("dotenv/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_2 = require("@nestjs/common");
const path_1 = require("path");
async function bootstrap() {
    // Allow overriding Nest logger levels via env:
    // e.g. LOG_LEVELS=log,warn,error,debug  (leave empty to keep Nest default)
    const rawLevels = String(process.env.LOG_LEVELS || '').trim();
    const parsedLevels = rawLevels
        ? rawLevels.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        cors: true,
        logger: parsedLevels, // undefined preserves Nest's default behavior
    });
    app.useGlobalPipes(new common_2.ValidationPipe({
        whitelist: true, // strips unknown fields (keep DTOs exact)
        forbidNonWhitelisted: false,
        transform: true,
    }));
    app.enableCors({
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Skip-Auth'],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    // Serve uploaded files (e.g., profile photos) from /uploads
    // Example URL: http://localhost:3000/uploads/12345.jpg
    app.useStaticAssets((0, path_1.join)(process.cwd(), 'uploads'), { prefix: '/uploads/' });
    await app.listen(process.env.PORT || 3000);
}
bootstrap();
//# sourceMappingURL=main.js.map