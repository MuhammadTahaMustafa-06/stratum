import { Helmet } from "react-helmet-async";
import { buildPortalCsp } from "../lib/csp";

/**
 * App-wide CSP via meta http-equiv (subset of directives browsers honor in meta tags).
 * Clickjacking / embedding: rely on reverse-proxy headers in prod (see nginx.conf).
 */
export default function PortalCspHelmet() {
  return (
    <Helmet>
      <meta httpEquiv="Content-Security-Policy" content={buildPortalCsp()} />
    </Helmet>
  );
}
