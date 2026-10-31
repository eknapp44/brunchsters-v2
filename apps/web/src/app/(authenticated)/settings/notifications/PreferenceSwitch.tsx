'use client';

import { useState, type ReactElement } from 'react';
import { Switch } from '@/components/ui/Switch';
import { switchName } from '@/lib/notificationCopy';
import { useMutation } from '@/store/useMutation';

// One switch on the settings page. It flips at once and goes back, with a toast saying why, if the
// route says no (`useMutation`, failure as a toast: one tap, nothing for the person to fix). The
// saved value is the server's; this keeps only the one the person is looking at, which is a single
// control's own state (ADR 0011).
export function PreferenceSwitch(props: {
  readonly lineId: string;
  readonly label: string;
  readonly types: readonly string[];
  readonly channel: 'in_app' | 'email';
  readonly caption: string;
  readonly initial: boolean;
}): ReactElement {
  const [checked, setChecked] = useState(props.initial);
  const { pending, run } = useMutation(`notification-preference:${props.lineId}:${props.channel}`);

  async function onChange(next: boolean): Promise<void> {
    setChecked(next);
    const result = await run({
      request: {
        url: '/api/v1/notification-preferences',
        method: 'PUT',
        body: { types: props.types, channel: props.channel, enabled: next },
      },
      failure: 'toast',
    });
    if (!result.ok) setChecked(!next);
  }

  return (
    <Switch
      name={switchName({ label: props.label, channel: props.channel })}
      caption={props.caption}
      checked={checked}
      busy={pending}
      onChange={(next) => void onChange(next)}
    />
  );
}
