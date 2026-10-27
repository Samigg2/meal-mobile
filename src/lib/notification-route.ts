/** The phone screens a web path can open; anything else is read here and finished on the web. */
export function phoneRoute(href: string) {
  const match = /^\/(participants|feedback|safeguarding)\/([0-9a-f-]{36})\/?$/i.exec(href);
  if (!match) return null;
  const id = match[2];
  switch (match[1].toLowerCase()) {
    case "participants":
      return { pathname: "/participants/[id]" as const, params: { id } };
    case "feedback":
      return { pathname: "/feedback/[id]" as const, params: { id } };
    default:
      return { pathname: "/safeguarding/[id]" as const, params: { id } };
  }
}
