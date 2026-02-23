import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, MousePointerClick, PenTool, Calendar } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface SignaturePosition {
  page: number;
  xRatio: number;
  yRatio: number;
}

type MarkerType = "signature" | "date";

interface Props {
  file: File;
  signaturePosition: SignaturePosition | null;
  datePosition: SignaturePosition | null;
  onSignaturePositionChange: (pos: SignaturePosition) => void;
  onDatePositionChange: (pos: SignaturePosition) => void;
}

const SignaturePositionPicker = ({ file, signaturePosition, datePosition, onSignaturePositionChange, onDatePositionChange }: Props) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [fileUrl] = useState(() => URL.createObjectURL(file));
  const [containerWidth, setContainerWidth] = useState(500);
  const [activeMarker, setActiveMarker] = useState<MarkerType>("signature");

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      observer.observe(node);
      setContainerWidth(node.clientWidth);
    }
  }, []);

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const pos: SignaturePosition = {
      page: currentPage - 1,
      xRatio: Math.max(0, Math.min(1, x)),
      yRatio: Math.max(0, Math.min(1, y)),
    };
    if (activeMarker === "signature") {
      onSignaturePositionChange(pos);
    } else {
      onDatePositionChange(pos);
    }
  };

  const sigOnCurrentPage = signaturePosition && signaturePosition.page === currentPage - 1;
  const dateOnCurrentPage = datePosition && datePosition.page === currentPage - 1;

  return (
    <div className="space-y-3">
      {/* Marker selector */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={activeMarker === "signature" ? "default" : "outline"}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setActiveMarker("signature")}
        >
          <PenTool className="h-3.5 w-3.5" />
          סמן מיקום חתימה
          {signaturePosition && " ✓"}
        </Button>
        <Button
          type="button"
          variant={activeMarker === "date" ? "default" : "outline"}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setActiveMarker("date")}
        >
          <Calendar className="h-3.5 w-3.5" />
          סמן מיקום תאריך
          {datePosition && " ✓"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
        <MousePointerClick className="h-4 w-4" />
        {activeMarker === "signature" ? "לחץ על המסמך לבחירת מיקום החתימה" : "לחץ על המסמך לבחירת מיקום התאריך"}
      </p>

      <div className="flex items-center justify-between">
        {numPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={currentPage >= numPages} onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[60px] text-center">{currentPage} / {numPages}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div ref={containerRef} className="relative border-2 border-dashed border-border rounded-lg overflow-hidden bg-muted/30 cursor-crosshair">
        <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess}>
          <div onClick={handlePageClick} className="relative">
            <Page pageNumber={currentPage} width={containerWidth} renderTextLayer={false} renderAnnotationLayer={false} />
            {/* Signature marker */}
            {sigOnCurrentPage && (
              <div
                className="absolute pointer-events-none"
                style={{ left: `${signaturePosition.xRatio * 100}%`, top: `${signaturePosition.yRatio * 100}%`, transform: "translate(-50%, -50%)" }}
              >
                <div className="relative">
                  <div className="w-28 h-10 border-2 border-primary bg-primary/10 rounded flex items-center justify-center">
                    <span className="text-xs text-primary font-medium">חתימה כאן</span>
                  </div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-pulse" />
                </div>
              </div>
            )}
            {/* Date marker */}
            {dateOnCurrentPage && (
              <div
                className="absolute pointer-events-none"
                style={{ left: `${datePosition.xRatio * 100}%`, top: `${datePosition.yRatio * 100}%`, transform: "translate(-50%, -50%)" }}
              >
                <div className="relative">
                  <div className="w-28 h-8 border-2 border-orange-500 bg-orange-500/10 rounded flex items-center justify-center">
                    <span className="text-xs text-orange-600 font-medium">תאריך כאן</span>
                  </div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
                </div>
              </div>
            )}
          </div>
        </Document>
      </div>

      <div className="flex gap-3 text-xs text-muted-foreground">
        {signaturePosition && <span>✓ חתימה בעמוד {signaturePosition.page + 1}</span>}
        {datePosition && <span>✓ תאריך בעמוד {datePosition.page + 1}</span>}
      </div>
    </div>
  );
};

export default SignaturePositionPicker;
