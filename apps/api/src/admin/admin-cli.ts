/**
 * MEM-82: the accounts of the administration console, managed only here,
 * on the command line, on the server:
 *
 *   docker compose exec api node dist/admin/admin-cli.js create <e-mail>
 *   docker compose exec api node dist/admin/admin-cli.js password <e-mail>
 *   docker compose exec api node dist/admin/admin-cli.js reset-2fa <e-mail>
 *   docker compose exec api node dist/admin/admin-cli.js delete <e-mail>
 *   docker compose exec api node dist/admin/admin-cli.js list
 *
 * The password is typed hidden, twice. Without a terminal (a pipe), it is
 * read from the standard input, once: for scripts and tests.
 */
import { createInterface } from 'node:readline';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';

const MIN_PASSWORD = 12;
const BCRYPT_ROUNDS = 12;
const USAGE = `Usage : node dist/admin/admin-cli.js <commande>
  create <e-mail>     crée un compte d'administration (mot de passe demandé)
  password <e-mail>   change son mot de passe
  reset-2fa <e-mail>  réinitialise sa double authentification (téléphone perdu)
  delete <e-mail>     supprime le compte
  list                liste les comptes`;

/** Asks a question; `hidden`: what is typed doesn't show. */
function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  if (hidden && process.stdin.isTTY) {
    // Readline writes back each key typed: only the question is written.
    const output = rl as unknown as { _writeToOutput: (text: string) => void };
    output._writeToOutput = (text: string) => {
      if (text.includes(question)) process.stdout.write(question);
      else if (text.includes('\n') || text.includes('\r')) process.stdout.write('\n');
    };
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** A new password, typed twice on a terminal. */
async function newPassword(): Promise<string> {
  const password = await ask('Mot de passe : ', true);
  if (password.length < MIN_PASSWORD)
    throw new Error(`Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`);
  if (process.stdin.isTTY && (await ask('Confirmation : ', true)) !== password) {
    throw new Error('Les deux saisies diffèrent.');
  }
  return password;
}

function normalized(email: string | undefined): string {
  const value = email?.trim().toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`E-mail invalide : « ${email ?? ''} ».\n${USAGE}`);
  return value;
}

/** `prompt`: how the new password is asked (replaced by the tests). */
/** The hash of a new password, after checking its length. */
async function hashed(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD)
    throw new Error(`Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`);
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function run(args: string[], prisma: PrismaService, prompt = newPassword): Promise<string> {
  const [command, argument] = args;
  switch (command) {
    case 'create': {
      const email = normalized(argument);
      if (await prisma.adminAccount.findUnique({ where: { email } }))
        throw new Error(`Le compte ${email} existe déjà.`);
      const passwordHash = await hashed(await prompt());
      await prisma.adminAccount.create({ data: { email, passwordHash } });
      return `Compte d'administration créé : ${email}`;
    }
    case 'password': {
      const email = normalized(argument);
      if (!(await prisma.adminAccount.findUnique({ where: { email } }))) throw new Error(`Aucun compte ${email}.`);
      const passwordHash = await hashed(await prompt());
      await prisma.adminAccount.update({ where: { email }, data: { passwordHash } });
      return `Mot de passe changé : ${email}. Ses sessions en cours restent valables jusqu'à leur expiration (2 h au plus).`;
    }
    case 'reset-2fa': {
      // MEM-86: phone and recovery codes lost. The account activates it again at its next login.
      const email = normalized(argument);
      const account = await prisma.adminAccount.findUnique({ where: { email } });
      if (!account) throw new Error(`Aucun compte ${email}.`);
      await prisma.$transaction([
        prisma.adminAccount.update({
          where: { email },
          data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpPendingSecret: null },
        }),
        prisma.adminRecoveryCode.deleteMany({ where: { adminId: account.id } }),
      ]);
      return `Double authentification réinitialisée : ${email}. Ses sessions en cours sont terminées ; à la prochaine connexion, elle sera activée de nouveau.`;
    }
    case 'delete': {
      const email = normalized(argument);
      const { count } = await prisma.adminAccount.deleteMany({ where: { email } });
      if (count === 0) throw new Error(`Aucun compte ${email}.`);
      return `Compte supprimé : ${email}. Ses sessions en cours ne donnent plus accès à la console.`;
    }
    case 'list': {
      const accounts = await prisma.adminAccount.findMany({ orderBy: { email: 'asc' } });
      if (accounts.length === 0) return "Aucun compte d'administration.";
      const date = (value: Date | null) => value?.toISOString().slice(0, 16).replace('T', ' ') ?? 'jamais';
      return accounts
        .map(
          (one) =>
            `${one.email}  (créé le ${date(one.createdAt)}, dernière connexion : ${date(one.lastLoginAt)}, ` +
            `double authentification : ${one.totpEnabledAt ? 'active' : 'à activer'})`,
        )
        .join('\n');
    }
    default:
      throw new Error(USAGE);
  }
}

// Run from the command line (not when imported by the tests).
if (process.argv[1]?.endsWith('admin-cli.js')) {
  const prisma = new PrismaService();
  run(process.argv.slice(2), prisma)
    .then((message) => console.log(message))
    .catch((error: Error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
