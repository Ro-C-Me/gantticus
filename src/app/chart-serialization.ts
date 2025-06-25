import { Chart } from './domain/Chart';
import { TypedJSON } from 'typedjson';

export class ChartSerialization {
  private static serializer = new TypedJSON(Chart);

  static serialize(charts: Chart[]): string {
    return JSON.stringify(charts);
  }
  
  static serializeChart(chart: Chart): string {
    return JSON.stringify(chart);
  }

  static deserialize(json: string): Chart | undefined {
    return this.serializer.parse(json) ?? undefined;
  }

  static deserializeArray(json: string): Chart[] {
    return this.serializer.parseAsArray(json) ?? [];
  }
}
