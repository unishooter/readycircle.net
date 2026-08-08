import { cx } from '@readycircle/ui';
import { aprsFiUrl } from './format.js';

export interface AprsCallsignLinkProps {
  callsign: string;
  className?: string;
}

/** Clickable MYCALL that opens the station's track on aprs.fi. */
export function AprsCallsignLink({ callsign, className }: AprsCallsignLinkProps) {
  return (
    <a
      href={aprsFiUrl(callsign)}
      target="_blank"
      rel="noopener noreferrer"
      className={cx('text-navy-700 hover:underline', className)}
      onClick={(event) => event.stopPropagation()}
    >
      {callsign}
    </a>
  );
}
