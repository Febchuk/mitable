export interface DateRange {
  startTimestamp: number;
  endTimestamp: number;
  type: "recent" | "date-range" | "single-date" | "none";
}
