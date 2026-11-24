import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HouseholdProfileForm } from "@/components/dashboard/HouseholdProfileForm";
import { AirQualityOverview } from "@/components/dashboard/AirQualityOverview";
import { NOW, profile } from "../fixtures/payloads";

describe("component accessibility semantics", () => {
  it("pairs every HouseholdProfileForm control with an accessible label and fieldset group", () => {
    render(<HouseholdProfileForm profile={profile({ hasIndoorSensor: true })} onChange={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Your household" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Who lives here" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Equipment" })).toBeInTheDocument();

    expect(screen.getByLabelText("Household size")).toHaveAttribute("id", "hh-size");
    expect(screen.getByLabelText("Young children")).toHaveAttribute("id", "hh-kids");
    expect(screen.getByLabelText("Elderly members")).toHaveAttribute("id", "hh-elderly");
    expect(screen.getByLabelText(/Respiratory sensitivity/)).toHaveAttribute("id", "hh-resp");
    expect(screen.getByLabelText("Main commute")).toHaveAttribute("id", "hh-commute");
    expect(screen.getByLabelText("Commute time")).toHaveAttribute("id", "hh-window");
    expect(screen.getByLabelText("Exercise routine")).toHaveAttribute("id", "hh-ex");
    expect(screen.getByLabelText("We own a HEPA air purifier")).toHaveAttribute("id", "hh-purifier");
    expect(screen.getByLabelText("We have an indoor PM2.5 sensor")).toHaveAttribute("id", "hh-sensor");
    expect(screen.getByLabelText(/User-Reported Indoor PM2.5/)).toHaveAttribute("id", "hh-indoor");
    expect(screen.getByLabelText("Reading taken (minutes ago)")).toHaveAttribute("id", "hh-age");
  });

  it("toggles sensor checkbox via keyboard/click and updates callback cleanly", () => {
    const onChange = vi.fn();
    render(<HouseholdProfileForm profile={profile({ hasIndoorSensor: false })} onChange={onChange} />);
    const sensorCheckbox = screen.getByLabelText("We have an indoor PM2.5 sensor");
    fireEvent.click(sensorCheckbox);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hasIndoorSensor: true }));
  });

  it("announces loading (aria-busy) and outage (role=alert) states accessibly", () => {
    const { container, rerender } = render(
      <AirQualityOverview air={null} loading={true} locationName="Delhi" profile={profile()} now={NOW} />,
    );
    expect(container.querySelector("section[aria-busy='true']")).toHaveTextContent("Fetching verified outdoor data for Delhi");

    rerender(
      <AirQualityOverview
        air={{ status: "unavailable", message: "Live Environmental Data Unavailable", attempted: [] }}
        loading={false}
        locationName="Delhi"
        profile={profile()}
        now={NOW}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Live Environmental Data Unavailable");
  });
});
