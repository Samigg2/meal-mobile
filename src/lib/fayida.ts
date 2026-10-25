import * as Linking from "expo-linking";
import { api } from "@/lib/api";

/**
 * The National ID check through Fayida (VeriFayda 2.0 / eSignet). The phone's
 * browser opens Fayida's page (or the web app's fake page until NIDP's
 * credentials are set); the person proves the ID there with Fayida's own SMS
 * code; Fayida returns the browser to the web app's /fayida/callback, which
 * hands over to this app as mealmis://fayida?state=…&code=… . The screen that
 * started the check stays open underneath and gets the result here.
 */

/** What Fayida holds, for auto-fill. */
export interface FayidaDemographics {
  /** Which ID was proved, when Fayida says. */
  national_id?: string;
  full_name?: string;
  date_of_birth?: string;
  sex?: "male" | "female";
  region?: string;
  zone?: string;
  woreda?: string;
  kebele?: string;
  phone?: string;
}

export interface FayidaCheck {
  /** One-time proof for the registration; good for 30 minutes. */
  fayida_token: string;
  /** "mock" while the fake page stands in: not real verification. */
  source: "fayida" | "mock";
  data: FayidaDemographics;
}

export type FayidaChannel = "staff" | "public";

/** Matches the server: a started check is good for 10 minutes. */
const GIVE_UP_AFTER_MS = 10 * 60 * 1000;

const start = (channel: FayidaChannel) =>
  channel === "staff"
    ? api.post<{ url: string; state: string }>("/participants/fayida/start")
    : api.anon.post<{ url: string; state: string }>("/public/participants/fayida/start");

const finish = (channel: FayidaChannel, state: string, code: string) =>
  channel === "staff"
    ? api.post<FayidaCheck>("/participants/fayida/finish", { state, code })
    : api.anon.post<FayidaCheck>("/public/participants/fayida/finish", { state, code });

/**
 * On the test page only: the ID typed in the app (the OIDC `login_hint`), so it
 * is not typed twice, and where this app answers (`app_return`). Expo Go does
 * not answer mealmis://, only its own exp://…/--/fayida address. The real
 * Fayida page is left alone: the person types the ID there, and an installed
 * app answers mealmis://.
 */
function withIdHint(url: string, nationalId?: string): string {
  if (!/\/fayida\/mock(\?|$)/.test(url)) return url;
  const extra = new URLSearchParams({ app_return: Linking.createURL("fayida") });
  if (nationalId) extra.set("login_hint", nationalId);
  return `${url}${url.includes("?") ? "&" : "?"}${extra}`;
}

/** Opens Fayida and waits for the person to come back to the app. */
export async function checkWithFayida(channel: FayidaChannel, nationalId?: string): Promise<FayidaCheck> {
  const { url: page, state } = await start(channel);
  const url = withIdHint(page, nationalId);
  return new Promise<FayidaCheck>((resolve, reject) => {
    const done = () => {
      subscription.remove();
      clearTimeout(timer);
    };
    const subscription = Linking.addEventListener("url", ({ url: incoming }) => {
      const { hostname, path, queryParams } = Linking.parse(incoming);
      if (hostname !== "fayida" && path !== "fayida") return;
      if (queryParams?.state !== state) return; // another check's answer
      done();
      const code = typeof queryParams.code === "string" ? queryParams.code : "";
      if (!code) {
        reject(
          new Error(
            queryParams.error === "access_denied"
              ? "The check was cancelled on Fayida's page."
              : "Fayida did not confirm the ID. Try again, or register now and verify later.",
          ),
        );
        return;
      }
      finish(channel, state, code).then(resolve, reject);
    });
    const timer = setTimeout(() => {
      subscription.remove();
      reject(new Error("The Fayida check took too long. Start it again."));
    }, GIVE_UP_AFTER_MS);
    Linking.openURL(url).catch(() => {
      done();
      reject(new Error("Could not open Fayida's page on this phone."));
    });
  });
}
