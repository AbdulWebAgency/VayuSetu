import { render, screen } from "@testing-library/react";
import { AirQualityOverview } from "@/components/dashboard/AirQualityOverview";
import { air, NOW, profile } from "../fixtures/payloads";

describe("AirQualityOverview", () => {
  it("shows provenance, scale and model label", () => {
    render(
      <AirQualityOverview
        air={{ status: "ok", data: air(), attempted: [] }}
        loading={false}
        locationName="Delhi"
        profile={profile()}
        now={NOW}
      />,
    );
    expect(screen.getByText("Atmospheric Model Estimate")).toBeInTheDocument();
    expect(screen.getByText("US EPA AQI")).toBeInTheDocument();
    expect(screen.getByTestId("freshness")).toHaveTextContent("Live");
    expect(screen.getByText("General Indoor Air-Quality Guidance")).toBeInTheDocument();
  });
  it("marks AQI unavailable when provider omits it", () => {
    render(
      <AirQualityOverview
        air={{ status: "ok", data: air({ aqi: null }), attempted: [] }}
        loading={false}
        locationName="Delhi"
        profile={profile()}
        now={NOW}
      />,
    );
    expect(screen.getByText(/Provider did not supply an AQI/)).toBeInTheDocument();
  });
  it("shows outage banner", () => {
    render(
      <AirQualityOverview
        air={{ status: "unavailable", message: "x", attempted: [] }}
        loading={false}
        locationName="Delhi"
        profile={profile()}
        now={NOW}
      />,
    );
    expect(screen.getByText("Live Environmental Data Unavailable")).toBeInTheDocument();
  });
  it("labels indoor readings as user-reported and never shows an indoor AQI", () => {
    render(
      <AirQualityOverview
        air={{ status: "ok", data: air(), attempted: [] }}
        loading={false}
        locationName="Delhi"
        profile={profile({ hasIndoorSensor: true, indoorPm25: 90, indoorReadingAgeMinutes: 5 })}
        now={NOW}
      />,
    );
    expect(screen.getByText("User-Reported Indoor PM2.5 (µg/m³)")).toBeInTheDocument();
    expect(screen.queryByText(/indoor aqi/i)).toBeNull();
    expect(screen.getByText(/comparable time/)).toBeInTheDocument();
  });
});
