"use client"

export default function Modal({children, onClose}: {children: React.ReactNode, onClose: () => void}) {
    return (
        <div
            onClick={onClose}
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
                onClick={(e) => e.stopPropagation()}
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
