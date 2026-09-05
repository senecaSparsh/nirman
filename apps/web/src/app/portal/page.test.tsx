// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@/test/render";
import { authMocks, setSessionUser, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: vi.fn() };
});

// Mock getPortalCustomer — controllable per test
vi.mock("@/lib/portal-auth", () => ({
  getPortalCustomer: vi.fn(),
}));

// Mock PortalDashboard client component
vi.mock("./PortalDashboard", () => ({
  PortalDashboard: (props: { customer: unknown }) => (
    <div data-testid="portal-dashboard">
      <span data-testid="customer-json">{JSON.stringify(props.customer)}</span>
    </div>
  ),
}));

import PortalPage from "./page";
import { getPortalCustomer } from "@/lib/portal-auth";

describe("PortalPage", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    vi.mocked(getPortalCustomer).mockResolvedValue(null);
  });

  it("redirects to /portal/login when no customer is authenticated", async () => {
    vi.mocked(getPortalCustomer).mockResolvedValue(null);
    await expect(PortalPage()).rejects.toThrow("NEXT_REDIRECT: /portal/login");
  });

  it("renders PortalDashboard when customer is authenticated", async () => {
    const customer = {
      id: "c1", name: "John Doe", phone: "1234567890", email: "john@test.com",
    };
    vi.mocked(getPortalCustomer).mockResolvedValue(customer as never);

    const ui = await PortalPage();
    render(ui);

    expect(screen.getByTestId("portal-dashboard")).toBeInTheDocument();
    const customerData = JSON.parse(screen.getByTestId("customer-json").textContent!);
    expect(customerData.id).toBe("c1");
    expect(customerData.name).toBe("John Doe");
  });
});
