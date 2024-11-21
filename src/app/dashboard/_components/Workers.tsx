"use client";

import { useEffect, useRef } from "react";

export function Workers() {
  const workerRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const initServiceWorker = async () => {
      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.register(
            "/upload.worker.js"
          );
          workerRef.current = registration;
          console.log("Upload Service Worker registered");

          // Listen for updates
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === "installed") {
                  if (navigator.serviceWorker.controller) {
                    console.log("Update available");
                  }
                }
              };
            }
          };
        } catch (error) {
          console.error("Service Worker registration failed:", error);
        }
      }
    };

    void initServiceWorker();

    return () => {
      void workerRef.current?.unregister();
    };
  }, []);

  return null;
}
