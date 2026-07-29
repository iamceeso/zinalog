import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

type EmailModule = typeof import("../lib/email");

const compiledEmailModulePath = path.resolve(__dirname, "../lib/email.js");
const compiledDbModulePath = path.resolve(__dirname, "../lib/db.js");
const cjsRequire = createRequire(__filename);

function mockModule(
  modulePath: string,
  exports: object
): NodeModule | undefined {
  const previous = cjsRequire.cache[modulePath];
  cjsRequire.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
    children: [],
    paths: [],
    isPreloading: false,
    parent: module,
    path: path.dirname(modulePath),
    require: cjsRequire,
  } as NodeModule;
  return previous;
}

function restoreModule(
  modulePath: string,
  previous: NodeModule | undefined
): void {
  if (previous) {
    cjsRequire.cache[modulePath] = previous;
  } else {
    delete cjsRequire.cache[modulePath];
  }
}

async function loadEmailModule(options: {
  settings: Record<string, string>;
  resendSend?: (
    payload: unknown
  ) => Promise<{ error?: { message: string } | null }>;
  createTransport?: (config: unknown) => {
    sendMail: (payload: unknown) => Promise<unknown>;
  };
}) {
  const previousEmailCache = cjsRequire.cache[compiledEmailModulePath];
  const previousDbCache = mockModule(compiledDbModulePath, {
    getAllSettings: async () => options.settings,
  });
  const nodemailerModulePath = cjsRequire.resolve("nodemailer");
  const resendModulePath = cjsRequire.resolve("resend");
  const previousNodemailerCache = mockModule(nodemailerModulePath, {
    __esModule: true,
    default: {
      createTransport:
        options.createTransport ??
        (() => ({
          sendMail: async () => undefined,
        })),
    },
  });
  const previousResendCache = mockModule(resendModulePath, {
    Resend: class {
      emails = {
        send:
          options.resendSend ??
          (async () => ({
            error: null,
          })),
      };
    },
  });

  delete cjsRequire.cache[compiledEmailModulePath];
  const emailModule = cjsRequire(compiledEmailModulePath) as EmailModule;

  return {
    emailModule,
    restore() {
      restoreModule(compiledEmailModulePath, previousEmailCache);
      restoreModule(compiledDbModulePath, previousDbCache);
      restoreModule(nodemailerModulePath, previousNodemailerCache);
      restoreModule(resendModulePath, previousResendCache);
    },
  };
}

test("getEmailConfig applies defaults and parses SMTP settings", async (t) => {
  const { emailModule, restore } = await loadEmailModule({
    settings: {
      email_provider: "smtp",
      email_from: "alerts@example.com",
      email_to: "team@example.com",
      smtp_host: "smtp.example.com",
      smtp_port: "465",
      smtp_secure: "1",
      smtp_user: "mailer",
      smtp_pass: "secret",
      resend_api_key: "re_live",
    },
  });
  t.after(restore);

  const config = await emailModule.getEmailConfig();
  assert.deepEqual(config, {
    provider: "smtp",
    from: "alerts@example.com",
    to: "team@example.com",
    smtp: {
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "mailer",
      pass: "secret",
    },
    resendApiKey: "re_live",
  });
});

test("getEmailConfig falls back to default values when settings are missing", async (t) => {
  const { emailModule, restore } = await loadEmailModule({
    settings: {},
  });
  t.after(restore);

  const config = await emailModule.getEmailConfig();
  assert.deepEqual(config, {
    provider: "disabled",
    from: "zinalog@example.com",
    to: "",
    smtp: {
      host: "",
      port: 587,
      secure: false,
      user: "",
      pass: "",
    },
    resendApiKey: "",
  });
});

test("sendEmail handles disabled and resend providers", async (t) => {
  const disabled = await loadEmailModule({
    settings: {
      email_provider: "disabled",
    },
  });
  t.after(disabled.restore);

  assert.deepEqual(
    await disabled.emailModule.sendEmail({
      to: "team@example.com",
      subject: "Alert",
      html: "<p>Body</p>",
    }),
    { ok: false, error: "Email provider is disabled" }
  );

  const resendMissingKey = await loadEmailModule({
    settings: {
      email_provider: "resend",
      email_from: "alerts@example.com",
      resend_api_key: "",
    },
  });
  t.after(resendMissingKey.restore);

  assert.deepEqual(
    await resendMissingKey.emailModule.sendEmail({
      to: "team@example.com",
      subject: "Alert",
      html: "<p>Body</p>",
    }),
    { ok: false, error: "Resend API key not configured" }
  );

  const resendError = await loadEmailModule({
    settings: {
      email_provider: "resend",
      email_from: "alerts@example.com",
      resend_api_key: "re_live",
    },
    resendSend: async () => ({
      error: { message: "Resend exploded" },
    }),
  });
  t.after(resendError.restore);

  assert.deepEqual(
    await resendError.emailModule.sendEmail({
      to: "team@example.com",
      subject: "Alert",
      html: "<p>Body</p>",
    }),
    { ok: false, error: "Resend exploded" }
  );

  const resendSuccess = await loadEmailModule({
    settings: {
      email_provider: "resend",
      email_from: "alerts@example.com",
      resend_api_key: "re_live",
    },
  });
  t.after(resendSuccess.restore);

  assert.deepEqual(
    await resendSuccess.emailModule.sendEmail({
      to: "team@example.com",
      subject: "Alert",
      html: "<p>Body</p>",
    }),
    { ok: true }
  );
});

test("sendEmail handles SMTP success, validation, and thrown errors", async (t) => {
  const sentMessages: unknown[] = [];

  const smtpSuccess = await loadEmailModule({
    settings: {
      email_provider: "smtp",
      email_from: "alerts@example.com",
      smtp_host: "smtp.example.com",
      smtp_port: "587",
      smtp_secure: "0",
      smtp_user: "mailer",
      smtp_pass: "secret",
    },
    createTransport: (config) => {
      sentMessages.push({ config });
      return {
        sendMail: async (payload) => {
          sentMessages.push({ payload });
        },
      };
    },
  });
  t.after(smtpSuccess.restore);

  assert.deepEqual(
    await smtpSuccess.emailModule.sendEmail({
      to: "team@example.com",
      subject: "Alert",
      html: "<p>Body</p>",
    }),
    { ok: true }
  );
  assert.equal(sentMessages.length, 2);

  const smtpWithoutAuth = await loadEmailModule({
    settings: {
      email_provider: "smtp",
      email_from: "alerts@example.com",
      smtp_host: "smtp.example.com",
      smtp_port: "587",
      smtp_secure: "0",
      smtp_user: "",
      smtp_pass: "",
    },
    createTransport: (config) => {
      sentMessages.push({ noAuthConfig: config });
      return {
        sendMail: async () => undefined,
      };
    },
  });
  t.after(smtpWithoutAuth.restore);

  assert.deepEqual(
    await smtpWithoutAuth.emailModule.sendEmail({
      to: "team@example.com",
      subject: "Alert",
      html: "<p>Body</p>",
    }),
    { ok: true }
  );

  const smtpMissingHost = await loadEmailModule({
    settings: {
      email_provider: "smtp",
      smtp_host: "",
    },
  });
  t.after(smtpMissingHost.restore);

  assert.deepEqual(
    await smtpMissingHost.emailModule.sendEmail({
      to: "team@example.com",
      subject: "Alert",
      html: "<p>Body</p>",
    }),
    { ok: false, error: "SMTP host not configured" }
  );

  const smtpThrow = await loadEmailModule({
    settings: {
      email_provider: "smtp",
      email_from: "alerts@example.com",
      smtp_host: "smtp.example.com",
      smtp_port: "587",
      smtp_secure: "0",
    },
    createTransport: () => ({
      sendMail: async () => {
        throw new Error("SMTP exploded");
      },
    }),
  });
  t.after(smtpThrow.restore);

  assert.deepEqual(
    await smtpThrow.emailModule.sendEmail({
      to: "team@example.com",
      subject: "Alert",
      html: "<p>Body</p>",
    }),
    { ok: false, error: "SMTP exploded" }
  );

  const smtpStringThrow = await loadEmailModule({
    settings: {
      email_provider: "smtp",
      email_from: "alerts@example.com",
      smtp_host: "smtp.example.com",
    },
    createTransport: () => ({
      sendMail: async () => {
        throw "plain failure";
      },
    }),
  });
  t.after(smtpStringThrow.restore);

  assert.deepEqual(
    await smtpStringThrow.emailModule.sendEmail({
      to: "team@example.com",
      subject: "Alert",
      html: "<p>Body</p>",
    }),
    { ok: false, error: "plain failure" }
  );
});
