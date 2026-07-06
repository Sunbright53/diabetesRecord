export type { paths, components, operations } from "./schema";

// Convenience aliases for common types
export type RegisterRequest = components["schemas"]["RegisterRequest"];
export type LoginRequest = components["schemas"]["LoginRequest"];
export type TokenResponse = components["schemas"]["TokenResponse"];
export type UserOut = components["schemas"]["UserOut"];
export type ProfileOut = components["schemas"]["ProfileOut"];

import type { components } from "./schema";
