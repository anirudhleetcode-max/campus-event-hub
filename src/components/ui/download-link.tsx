import * as React from "react";

/**
 * Anchor for file downloads served by route handlers (CSV/PDF). Client-side
 * <Link> navigation must not be used for these: they aren't pages.
 */
export function DownloadLink({ href, children, className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a href={href} className={className} download {...props}>
      {children}
    </a>
  );
}
