import { useState } from "react";
import { QRCodeCard, QRScannerModal } from "../components/QRVerification";
import { Button } from "../components/ui/button";

export default function QRTestHarness() {
  const [taskId, setTaskId] = useState("task-12345");
  const [qrType, setQrType] = useState<"pickup" | "delivery">("pickup");
  const [compact, setCompact] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerType, setScannerType] = useState<"pickup" | "delivery">("pickup");
  const [lastVerifiedStatus, setLastVerifiedStatus] = useState<string | null>(null);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 bg-background min-h-screen">
      <h1 className="text-2xl font-bold">QR Verification Test Harness</h1>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 p-4 border rounded-xl bg-card">
        <Button onClick={() => setTaskId("task-12345")} variant="outline" size="sm" data-testid="set-task-1">
          Task 12345
        </Button>
        <Button onClick={() => setTaskId("task-67890")} variant="outline" size="sm" data-testid="set-task-2">
          Task 67890
        </Button>
        <Button onClick={() => setQrType(prev => prev === "pickup" ? "delivery" : "pickup")} variant="outline" size="sm" data-testid="toggle-type">
          Toggle Type ({qrType})
        </Button>
        <Button onClick={() => setCompact(prev => !prev)} variant="outline" size="sm" data-testid="toggle-compact">
          Toggle Compact ({compact ? "ON" : "OFF"})
        </Button>
        <Button onClick={() => setScannerOpen(true)} className="bg-primary" size="sm" data-testid="open-scanner-btn">
          Open Scanner Modal
        </Button>
        <Button onClick={() => setScannerType(prev => prev === "pickup" ? "delivery" : "pickup")} variant="outline" size="sm" data-testid="toggle-scanner-type">
          Scanner Type ({scannerType})
        </Button>
      </div>

      {/* QRCodeCard display */}
      <div className="p-6 border rounded-2xl bg-card" data-testid="qr-card-container">
        <h2 className="text-lg font-semibold mb-4">QRCodeCard Component</h2>
        <QRCodeCard
          taskId={taskId}
          type={qrType}
          compact={compact}
        />
      </div>

      {/* QRScannerModal */}
      <QRScannerModal
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        scanType={scannerType}
        volunteerId="fb5bf226-d896-4de1-ab33-a260044e6242"
        onVerified={status => setLastVerifiedStatus(status)}
      />

      {lastVerifiedStatus && (
        <div data-testid="verified-result" className="p-4 bg-emerald-500/20 text-emerald-400 rounded-lg">
          Verified status: {lastVerifiedStatus}
        </div>
      )}
    </div>
  );
}
