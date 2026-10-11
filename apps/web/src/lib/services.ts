import {
  NoopEventBus,
  type BrunchEventName,
  type BrunchEventPayloads,
  type EmailService,
  type EventBus,
} from '@brunchsters/core';
import { Resend } from 'resend';
import { FileEmailService } from '@/adapters/FileEmailService';
import { InngestEventBus } from '@/adapters/InngestEventBus';
import { ResendEmailService } from '@/adapters/ResendEmailService';
import { inngest } from '@/inngest/client';
import { resolveServerConfig, type ServerConfig } from './serverConfig';

// The one place the app decides which adapters run (ADR 0009), chosen by configuration.
// Built on first use, not at import: `next build` imports every route and must not need
// production keys. A misconfigured deployment still fails at startup, because
// instrumentation.ts resolves the config when the server boots.
type Services = {
  readonly config: ServerConfig;
  readonly eventBus: EventBus;
  readonly emailService: EmailService;
};

let services: Services | undefined;

function createServices(config: ServerConfig): Services {
  return {
    config,
    eventBus: config.queue.kind === 'inngest' ? new InngestEventBus(inngest) : new NoopEventBus(),
    emailService:
      config.email.kind === 'resend'
        ? new ResendEmailService(new Resend(config.email.apiKey), config.email.from)
        : new FileEmailService(config.email.outboxDir),
  };
}

function getServices(): Services {
  services ??= createServices(resolveServerConfig(process.env));
  return services;
}

// Routes import this constant as before; it resolves the real bus when first used.
export const eventBus: EventBus = {
  emit<N extends BrunchEventName>(name: N, data: BrunchEventPayloads[N]): Promise<void> {
    return getServices().eventBus.emit(name, data);
  },
};

export function getEmailService(): EmailService {
  return getServices().emailService;
}

export function getAppUrl(): string {
  return getServices().config.appUrl;
}
