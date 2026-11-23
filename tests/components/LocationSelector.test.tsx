import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocationSelector } from "@/components/dashboard/LocationSelector";

describe("LocationSelector", () => {
  it("requires confirmation of a geocoded Indian location", async () => {
    const onConfirm = vi.fn();
    render(<LocationSelector selected={null} onConfirm={onConfirm} search={async () => [{ name: "Lucknow", admin: "Uttar Pradesh", coordinates: { lat: 26.84, lon: 80.92 } }]} />);
    fireEvent.change(screen.getByLabelText(/search another indian city/i), { target: { value: "Lucknow" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(await screen.findByText(/Uttar Pradesh/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /confirm lucknow/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: "Lucknow" }));
  });
  it("shows Location Not Found in India without substituting", async () => {
    const onConfirm = vi.fn();
    render(<LocationSelector selected={null} onConfirm={onConfirm} search={async () => []} />);
    fireEvent.change(screen.getByLabelText(/search another indian city/i), { target: { value: "Atlantis" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Location Not Found in India"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
