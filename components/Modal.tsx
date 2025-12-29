"use client"

import { useEffect, useState, useRef } from "react"

export default function Modal({children}: {children: React.ReactNode}) {
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
        >
            <div
                style={{
                    background: "#1a1a1a",
                    padding: 32,
                    borderRadius: 12,
                    maxWidth: 500,
                    width: "90%",
                }}
            >
                {children}
            </div>
        </div >
    )
}
