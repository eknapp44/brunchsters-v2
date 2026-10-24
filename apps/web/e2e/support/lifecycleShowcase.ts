import type { BrunchId } from '@brunchsters/shared';
import { createBrunch, uniqueSuffix } from './factories';
import type { Actor } from './fixtures';
import { afterTheHold, callOffBrunch } from './lifecycle';
import { addAttendee } from './voting';

// One host and one guest with a brunch in each lifecycle state (spec 0013), for the checks that
// look at every screen (axe, layout, the review pictures). Like every factory it goes through the
// real core services. The called-off brunch was called off long enough ago for its hold to be over
// but its guests have not been told (no queue event is sent), so its Delete is still waiting.
export type LifecycleShowcase = {
  readonly host: Actor;
  readonly guest: Actor;
  readonly active: { readonly id: BrunchId; readonly title: string };
  readonly draft: { readonly id: BrunchId; readonly title: string };
  readonly calledOff: { readonly id: BrunchId; readonly title: string };
};

export async function createLifecycleShowcase(
  makeActor: (label: string) => Promise<Actor>,
): Promise<LifecycleShowcase> {
  const host = await makeActor('host');
  const guest = await makeActor('guest');

  const make = async (label: string, joinGuest: boolean) => {
    const title = `${label} Brunch ${uniqueSuffix()}`;
    const id = await createBrunch({ host: host.user, title });
    if (joinGuest)
      await addAttendee({ brunchId: id, host: host.user, user: guest.user, response: 'yes' });
    return { id, title };
  };

  const active = await make('Open', true);
  const draft = await make('Draft', false);
  const calledOff = await make('Called Off', true);
  await callOffBrunch({
    brunchId: calledOff.id,
    host: host.user,
    at: afterTheHold(),
    announce: false,
  });

  return { host, guest, active, draft, calledOff };
}

// The guest hides a brunch the way the page's button does, through the real route.
export async function hideForGuest(params: {
  readonly guest: Actor;
  readonly brunchId: BrunchId;
}): Promise<void> {
  const response = await params.guest.context.request.put(
    `/api/v1/brunches/${params.brunchId}/hidden`,
    { data: { hidden: true } },
  );
  if (!response.ok()) throw new Error(`Hiding the brunch failed: ${response.status()}`);
}
