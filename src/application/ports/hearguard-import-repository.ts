import type {
  CommitImportResult,
  ImportBatchListItem,
  ImportBatchRow,
  ImportValidationContext,
  ValidatedImportRow,
  CreatableImportExamType,
} from "../import-view-models";
import type {
  CsvColumnMapping,
  ParsedCsvRow,
} from "@/domain/imports/csv-audiometry-import";

export interface HearGuardImportRepository {
  createBatch(input: {
    organizationId: string;
    filename: string;
    headers: string[];
    rows: ParsedCsvRow[];
    examType: CreatableImportExamType;
  }): Promise<string>;
  listBatches(): Promise<ImportBatchListItem[]>;
  getBatch(id: string): Promise<ImportBatchListItem | null>;
  listBatchRows(id: string): Promise<ImportBatchRow[]>;
  getValidationContext(organizationId: string): Promise<ImportValidationContext>;
  saveValidation(input: {
    batchId: string;
    mapping: CsvColumnMapping;
    rows: ValidatedImportRow[];
    rowsReady: number;
    rowsWarning: number;
    rowsError: number;
  }): Promise<void>;
  commitBatch(id: string): Promise<CommitImportResult>;
}
