/**
 * Utilities für Wochen-Berechnungen (ISO 8601)
 */

export interface WeekView {
  year: number;
  weekNumber: number;
  startDate: Date;  // Montag
  endDate: Date;    // Sonntag
  days: Date[];     // Array mit 7 Tagen (Mo-So)
}

/**
 * Gibt die ISO-Wochennummer eines Datums zurück (1-53)
 */
export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Gibt das Jahr der ISO-Woche zurück (kann von Kalenderjahr abweichen)
 */
export function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

/**
 * Gibt den Montag einer Woche zurück
 */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Sonntag = 0 -> -6, sonst +1
  return new Date(d.setDate(diff));
}

/**
 * Erstellt ein WeekView-Objekt für eine gegebene Woche
 */
export function getWeekView(year: number, weekNumber: number): WeekView {
  // Finde den ersten Tag des Jahres
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = getMonday(jan4);
  
  // Addiere Wochen
  const weekStart = new Date(monday);
  weekStart.setDate(monday.getDate() + (weekNumber - 1) * 7);
  
  // Erstelle Array mit allen 7 Tagen
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    days.push(day);
  }
  
  const weekEnd = new Date(days[6]);
  
  return {
    year,
    weekNumber,
    startDate: new Date(days[0]),
    endDate: weekEnd,
    days
  };
}

/**
 * Gibt die WeekView für die aktuelle Woche zurück
 */
export function getCurrentWeek(): WeekView {
  const now = new Date();
  const year = getISOWeekYear(now);
  const weekNumber = getISOWeek(now);
  return getWeekView(year, weekNumber);
}

/**
 * Gibt die WeekView für ein bestimmtes Datum zurück
 */
export function getWeekForDate(date: Date): WeekView {
  const year = getISOWeekYear(date);
  const weekNumber = getISOWeek(date);
  return getWeekView(year, weekNumber);
}

/**
 * Navigation: Vorherige Woche
 */
export function getPreviousWeek(currentWeek: WeekView): WeekView {
  const prevWeekDate = new Date(currentWeek.startDate);
  prevWeekDate.setDate(prevWeekDate.getDate() - 7);
  return getWeekForDate(prevWeekDate);
}

/**
 * Navigation: Nächste Woche
 */
export function getNextWeek(currentWeek: WeekView): WeekView {
  const nextWeekDate = new Date(currentWeek.startDate);
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  return getWeekForDate(nextWeekDate);
}

/**
 * Formatiert einen Datumsbereich (z.B. "13. - 19. Jan 2026")
 */
export function formatWeekRange(weekView: WeekView): string {
  const start = weekView.startDate;
  const end = weekView.endDate;
  
  const startDay = start.getDate();
  const endDay = end.getDate();
  
  const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 
                      'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const month = monthNames[end.getMonth()];
  const year = end.getFullYear();
  
  return `${startDay}. - ${endDay}. ${month} ${year}`;
}

/**
 * Prüft, ob zwei Daten am selben Tag sind
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

/**
 * Prüft, ob ein Datum ein Wochenende ist (Sa/So)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sonntag = 0, Samstag = 6
}
