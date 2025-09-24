"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/main.ts
require("dotenv/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const path_1 = require("path");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { cors: true });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true, // strips unknown fields (keep DTOs exact)
        forbidNonWhitelisted: false,
        transform: true,
    }));
    app.enableCors({
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        credentials: false,
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