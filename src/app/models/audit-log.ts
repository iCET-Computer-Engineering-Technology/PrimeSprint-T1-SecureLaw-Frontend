import { ActionType } from "../services/audit-log";

export interface AuditLog {
    id: string;
    userId: string;
    timestamp: string;
    target: string;
    action: ActionType;
    templateId: string;
    maskCounts: { [key: string]: number };
    modelUsed: string;
    responseTime: number;
    details: string;
}
