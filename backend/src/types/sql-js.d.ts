declare module "sql.js" {
  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  export interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string, params?: any[]): QueryExecResult[];
    each(
      sql: string,
      params: any[],
      callback: (row: any) => void,
      done: () => void,
    ): Database;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }

  export interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    getAsObject(params?: any): Record<string, any>;
    get(params?: any[]): any[];
    free(): boolean;
    run(params?: any[]): void;
    reset(): void;
    columns(): string[];
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface SqlJsInitOptions {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(
    options?: SqlJsInitOptions,
  ): Promise<SqlJsStatic>;
}
