import { Suspense } from "react";
import ReturnHistoryClient from "./ReturnHistoryClient";

export default function ReturnHistoryPage() {
  return (
    <Suspense fallback={null}>
      <ReturnHistoryClient />
    </Suspense>
  );
}

