import type { DateRange } from "../shared-types/date.types";

/**
 * Parse natural language date queries into Unix timestamp ranges
 */
export function parseDateRange(message: string): DateRange {
  const isRecentQuery = /\b(today|recent|latest|this week|yesterday)\b/i.test(message);
  const hasDateRange = /\b(from|between|october|september|january|february|march|april|may|june|july|august|november|december|\d{1,2}(st|nd|rd|th))\b/i.test(message);
  
  if (!isRecentQuery && !hasDateRange) {
    return {
      startTimestamp: 0,
      endTimestamp: Math.floor(Date.now() / 1000),
      type: "none"
    };
  }

  if (isRecentQuery) {
    // Last 7 days for "recent" queries
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return {
      startTimestamp: Math.floor(sevenDaysAgo.getTime() / 1000),
      endTimestamp: Math.floor(Date.now() / 1000),
      type: "recent"
    };
  }

  if (hasDateRange) {
    const currentYear = new Date().getFullYear();
    const monthMap: { [key: string]: number } = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
    };
    
    const monthMatch = message.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
    
    // Check for day ranges (e.g., "october 7th to 9th")
    const dayRangeMatch = message.match(/(\d{1,2})(st|nd|rd|th)?\s+(?:to|through|-)\s+(?:the\s+)?(\d{1,2})/i);
    
    if (monthMatch && dayRangeMatch) {
      const monthName = monthMatch[1].toLowerCase();
      const month = monthMap[monthName];
      const startDay = parseInt(dayRangeMatch[1]);
      const endDay = parseInt(dayRangeMatch[3]);
      
      const startDate = new Date(currentYear, month, startDay, 0, 0, 0);
      const endDate = new Date(currentYear, month, endDay, 23, 59, 59);
      
      return {
        startTimestamp: Math.floor(startDate.getTime() / 1000),
        endTimestamp: Math.floor(endDate.getTime() / 1000),
        type: "date-range"
      };
    }
    
    // Check for single date (e.g., "october 7th", "what happened on october 7")
    const singleDayMatch = message.match(/\b(\d{1,2})(st|nd|rd|th)?\b/i);
    
    if (monthMatch && singleDayMatch) {
      const monthName = monthMatch[1].toLowerCase();
      const month = monthMap[monthName];
      const day = parseInt(singleDayMatch[1]);
      
      const startDate = new Date(currentYear, month, day, 0, 0, 0);
      const endDate = new Date(currentYear, month, day, 23, 59, 59);
      
      return {
        startTimestamp: Math.floor(startDate.getTime() / 1000),
        endTimestamp: Math.floor(endDate.getTime() / 1000),
        type: "single-date"
      };
    }
    
    // Fallback to last 30 days if we can't parse the date
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return {
      startTimestamp: Math.floor(thirtyDaysAgo.getTime() / 1000),
      endTimestamp: Math.floor(Date.now() / 1000),
      type: "date-range"
    };
  }

  return {
    startTimestamp: 0,
    endTimestamp: Math.floor(Date.now() / 1000),
    type: "none"
  };
}
