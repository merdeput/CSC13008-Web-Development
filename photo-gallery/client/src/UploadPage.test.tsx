// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadPage } from "./UploadPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function chooseAndFill() {
  render(<UploadPage />);
  const user = userEvent.setup();
  const file = new File(["photo-bytes"], "heron.jpg", { type: "image/jpeg" });
  await user.upload(screen.getByLabelText("Choose photos"), file);
  await user.type(screen.getByLabelText("Title"), "Heron at the water");
  await user.type(screen.getByLabelText("Category"), "Birds");
  await user.type(screen.getByLabelText("Caption"), "A quiet morning");
  return user;
}

describe("UploadPage", () => {
  it("collects the remaining photo details and displays independent results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 207,
      json: async () => ({ results: [
        { fileIndex: 0, originalName: "heron.jpg", status: "succeeded" },
        { fileIndex: 1, originalName: "fox.png", status: "failed", error: { code: "INVALID_IMAGE", message: "Image cannot be decoded." } },
      ] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = await chooseAndFill();
    await user.click(screen.getByRole("button", { name: "Upload 1 photo" }));

    await screen.findByText("Upload results");
    expect(screen.getByText(/Uploaded successfully/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
    const formData = fetchMock.mock.calls[0][1].body as FormData;
    const metadata = JSON.parse(String(formData.get("metadata")));
    expect(metadata[0]).toMatchObject({
      title: "Heron at the water",
      category: "Birds",
    });
    expect(metadata[0]).not.toHaveProperty("altText");
    expect(metadata[0]).not.toHaveProperty("permissionConfirmed");
  });

  it("does not show the removed metadata fields", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue({ status: 201, json: async () => ({ results: [{ fileIndex: 0, originalName: "heron.jpg", status: "succeeded" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<UploadPage />);
    await user.upload(screen.getByLabelText("Choose photos"), new File(["image"], "heron.jpg", { type: "image/jpeg" }));
    await user.type(screen.getByLabelText("Title"), "Heron");
    await user.click(screen.getByRole("button", { name: "Upload 1 photo" }));
    expect(await screen.findByText("Upload results")).toBeTruthy();
    const metadata = JSON.parse(String((fetchMock.mock.calls[0][1].body as FormData).get("metadata")));
    expect(metadata[0]).toEqual({ title: "Heron", caption: "", category: "", story: "" });
    for (const label of ["Alt text", "Tags comma separated", "Photographer credit", "Location name", "Continent", "Region", "Country", "Species · common name", "Species · Latin name", "Competition", "Award", "Competition year", "I have permission to use this image."]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it("rejects a selection of more than five files", async () => {
    render(<UploadPage />);
    const files = Array.from({ length: 6 }, (_, index) => new File(["x"], `photo-${index}.jpg`, { type: "image/jpeg" }));
    fireEvent.change(screen.getByLabelText("Choose photos"), { target: { files } });
    expect((await screen.findByRole("alert")).textContent).toContain("no more than five");
    expect(screen.queryByRole("button", { name: /Upload/ })).toBeNull();
  });
});
