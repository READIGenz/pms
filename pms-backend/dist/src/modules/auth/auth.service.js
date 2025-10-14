"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
// pms-backend/src/modules/auth/auth.service.ts
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../../prisma/prisma.service"); // adjust path as needed
let AuthService = AuthService_1 = class AuthService {
    constructor(prisma, jwt) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.logger = new common_1.Logger(AuthService_1.name);
        this.debug = String(process.env.AUTH_DEBUG || '').toLowerCase() === '1'
            || String(process.env.AUTH_DEBUG || '').toLowerCase() === 'true';
    }
    async exists(login, verbose = false) {
        const user = await this.findByLogin(login);
        if (!user)
            return { ok: true, exists: false };
        const res = { ok: true, exists: true };
        if (verbose)
            res.user = { name: this.fullName(user), status: user.userStatus };
        return res;
    }
    async verifyOtp(login, code) {
        // TODO: replace with your real OTP validation
        if (code !== '000000') {
            throw new common_1.UnauthorizedException('Invalid OTP');
        }
        const user = await this.findByLogin(login);
        if (!user)
            throw new common_1.UnauthorizedException('User not found');
        if (user.userStatus !== 'Active')
            throw new common_1.UnauthorizedException('User is inactive');
        // Load role memberships with company/project for labels
        const memberships = await this.prisma.userRoleMembership.findMany({
            where: { userId: user.userId },
            include: {
                company: { select: { companyId: true, name: true, companyRole: true } },
                project: { select: { projectId: true, title: true, code: true } },
            },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        });
        return { user, memberships };
    }
    async assumeRole(userId, membershipId) {
        const m = await this.prisma.userRoleMembership.findFirst({
            where: { id: membershipId, userId },
            include: {
                company: { select: { companyId: true, name: true, companyRole: true } },
                project: { select: { projectId: true, title: true, code: true } },
            },
        });
        if (!m)
            throw new common_1.BadRequestException('Invalid membership');
        const user = await this.prisma.user.findUnique({
            where: { userId },
            select: {
                userId: true,
                firstName: true,
                middleName: true, // <-- added so we can build full name in token
                lastName: true,
                email: true,
                phone: true,
                countryCode: true,
                userStatus: true,
                isSuperAdmin: true,
            },
        });
        if (!user)
            throw new common_1.UnauthorizedException('User not found');
        // Final token for the chosen role
        const fullName = this.fullName(user);
        const jwtPayload = {
            sub: user.userId,
            userId: user.userId,
            name: fullName,
            email: user.email ?? null,
            isSuperAdmin: !!user.isSuperAdmin,
            role: m.role,
            scopeType: m.scopeType,
            companyId: m.companyId ?? null,
            projectId: m.projectId ?? null,
        };
        // DEBUG (guarded): payload we’re about to sign
        if (this.debug) {
            this.logger.debug(`[AUTH] assumeRole: signing JWT payload -> sub=${jwtPayload.sub} userId=${jwtPayload.userId} name="${jwtPayload.name}" ` +
                `isSuperAdmin=${jwtPayload.isSuperAdmin} role=${jwtPayload.role} scopeType=${jwtPayload.scopeType} ` +
                `companyId=${jwtPayload.companyId ?? 'null'} projectId=${jwtPayload.projectId ?? 'null'}`);
        }
        const token = await this.signJwt(jwtPayload, { expiresIn: '2h' });
        // DEBUG (guarded): token length only (don’t log full token)
        if (this.debug) {
            this.logger.debug(`[AUTH] assumeRole: signed JWT length=${token.length}`);
        }
        return {
            ok: true,
            token,
            jwt: jwtPayload,
            user: {
                userId: user.userId,
                name: fullName,
                email: user.email,
                phone: user.phone,
                countryCode: user.countryCode,
                status: user.userStatus,
                isSuperAdmin: !!user.isSuperAdmin,
            },
            role: {
                id: m.id,
                role: m.role,
                scopeType: m.scopeType,
                scopeId: m.companyId ?? m.projectId ?? null,
                label: this.describeMembership(m),
                company: m.companyId
                    ? { id: m.companyId, name: m.company?.name, role: m.company?.companyRole }
                    : undefined,
                project: m.projectId
                    ? { id: m.projectId, title: m.project?.title, code: m.project?.code }
                    : undefined,
            },
        };
    }
    describeMembership(m) {
        switch (m.scopeType) {
            case 'Global':
                return `${m.role} — Global`;
            case 'Company':
                return `${m.role} @ ${m.company?.name ?? 'Company'}`;
            case 'Project':
                return `${m.role} — ${m.project?.title ?? 'Project'}${m.project?.code ? ` (${m.project.code})` : ''}`;
            default:
                return m.role;
        }
    }
    signJwt(payload, options) {
        return this.jwt.signAsync(payload, options);
    }
    async findByLogin(raw) {
        const login = (raw || '').trim();
        if (!login)
            return null;
        if (login.includes('@')) {
            return this.prisma.user.findUnique({ where: { email: login.toLowerCase() } });
        }
        // phone: accept with or without +91, etc.
        const digits = login.replace(/\D/g, '');
        // if you store +91 in db, normalize here as needed
        return this.prisma.user.findFirst({
            where: {
                OR: [
                    { phone: digits },
                    { phone: login },
                ],
            },
        });
    }
    fullName(u) {
        return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ').trim() || 'User';
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map