import React from "react";
import { createRoot } from "react-dom/client";
import { GalleryPage } from "./GalleryPage.js";
import { ProfilePage } from "./ProfilePage.js";
import { EditImagePage } from "./EditImagePage.js";
import "./style.css";

const profileMatch = window.location.pathname.match(/^\/u\/([^/]+)\/?$/);
const profileName = profileMatch ? decodeURIComponent(profileMatch[1]) : null;
const editMatch = window.location.pathname.match(/^\/photos\/([0-9a-f-]+)\/edit\/?$/i);
const editId = editMatch ? decodeURIComponent(editMatch[1]) : null;
createRoot(document.getElementById("root")!).render(<React.StrictMode>{editId ? <EditImagePage photoId={editId} /> : profileName ? <ProfilePage username={profileName} /> : <GalleryPage />}</React.StrictMode>);
