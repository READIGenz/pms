import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class AdminCodeService {
  /** Generate the next user code like "USR-0001" */
  async nextUserCode(tx: PrismaClient | Prisma.TransactionClient): Promise<string> {
    const latest = await (tx as PrismaClient).user.findFirst({
      where: { code: { startsWith: 'USR-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });

    const lastNum = (() => {
      const m = latest?.code?.match(/^USR-(\d{4,})$/);
      return m ? parseInt(m[1], 10) : 0;
    })();

    const nextNum = lastNum + 1;
    return `USR-${String(nextNum).padStart(4, '0')}`;
  }
}
