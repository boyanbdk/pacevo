import { describe, expect, it } from "vitest";
import { authErrorMessage, recoveryModeForAuthError } from "./auth-client";

describe("auth client error mapping", () => {
  it("maps wrong-path account states to plain-language recovery copy", () => {
    expect(authErrorMessage("account_exists")).toBe("That email already has a Pacevo account. Log in instead.");
    expect(authErrorMessage("account_not_found")).toBe("No Pacevo account exists for that email. Create one instead.");
  });

  it("only offers recovery mode switches for wrong-path account states", () => {
    expect(recoveryModeForAuthError("account_exists")).toBe("login");
    expect(recoveryModeForAuthError("account_not_found")).toBe("register");
    expect(recoveryModeForAuthError("invalid_credentials")).toBeNull();
  });
});
