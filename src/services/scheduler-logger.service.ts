// src/services/scheduler-logger.service.ts
import * as fs from 'fs';
import * as path from 'path';

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  jobId?: number;
  message: string;
  data?: any;
}

class Logger {
  private logDir: string;
  private currentJobId?: number;
  private jobLogs: string[] = [];
  private jobStartTime?: Date;

  constructor() {
    // Create logs directory
    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Safely serialize data containing BigInt values
   */
  private safeStringify(data: any): string {
    return JSON.stringify(data, (key, value) => {
      // Convert BigInt to string
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2);
  }

  /**
   * Initialize job logging
   */
  startJobLogging(jobId: number): void {
    this.currentJobId = jobId;
    this.jobLogs = [];
    this.jobStartTime = new Date();
    
    this.info(`🚀 Job ${jobId} started`);
  }

  /**
   * Write to file
   */
  private writeToFile(filename: string, content: string): void {
    try {
      const filepath = path.join(this.logDir, filename);
      fs.appendFileSync(filepath, content + '\n', 'utf8');
    } catch (err) {
      console.error('Failed to write log file:', err);
    }
  }

  /**
   * Format log entry
   */
  private formatLog(entry: LogEntry): string {
    const { timestamp, level, jobId, message, data } = entry;
    const jobPrefix = jobId ? `[JobID: ${jobId}] ` : '';
    const dataStr = data ? `\n${this.safeStringify(data)}` : '';
    return `[${timestamp}] [${level}] ${jobPrefix}${message}${dataStr}`;
  }

  /**
   * INFO level log
   */
  info(message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      jobId: this.currentJobId,
      message,
      data
    };
    
    const formattedLog = this.formatLog(entry);
    console.log(formattedLog);
    
    if (this.currentJobId) {
      this.jobLogs.push(formattedLog);
    }
    
    // Write to daily log
    const dateStr = new Date().toISOString().split('T')[0];
    this.writeToFile(`app-${dateStr}.log`, formattedLog);
  }

  /**
   * SUCCESS level log
   */
  success(message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'SUCCESS',
      jobId: this.currentJobId,
      message,
      data
    };
    
    const formattedLog = this.formatLog(entry);
    console.log('✅', formattedLog);
    
    if (this.currentJobId) {
      this.jobLogs.push(formattedLog);
    }
    
    const dateStr = new Date().toISOString().split('T')[0];
    this.writeToFile(`app-${dateStr}.log`, formattedLog);
  }

  /**
   * WARN level log
   */
  warn(message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      jobId: this.currentJobId,
      message,
      data
    };
    
    const formattedLog = this.formatLog(entry);
    console.warn('⚠️', formattedLog);
    
    if (this.currentJobId) {
      this.jobLogs.push(formattedLog);
    }
    
    const dateStr = new Date().toISOString().split('T')[0];
    this.writeToFile(`warnings-${dateStr}.log`, formattedLog);
  }

  /**
   * ERROR level log
   */
  error(message: string, error?: any, context?: any): void {
    const errorDetails = {
      errorType: error?.name || 'UnknownError',
      errorMessage: error?.message || message,
      errorStack: error?.stack,
      context,
      timestamp: new Date().toISOString()
    };

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      jobId: this.currentJobId,
      message,
      data: errorDetails
    };
    
    const formattedLog = this.formatLog(entry);
    console.error('❌', formattedLog);
    
    if (this.currentJobId) {
      this.jobLogs.push(formattedLog);
    }
    
    const dateStr = new Date().toISOString().split('T')[0];
    
    // Write to error.log
    this.writeToFile(`error-${dateStr}.log`, formattedLog);
    
    // Write detailed error
    const errorDetail = `
${'='.repeat(100)}
⚠️  ERROR OCCURRED
${'='.repeat(100)}
Time:        ${errorDetails.timestamp}
Job ID:      ${this.currentJobId || 'N/A'}
Error Type:  ${errorDetails.errorType}
Message:     ${errorDetails.errorMessage}

Stack Trace:
${errorDetails.errorStack || 'No stack trace available'}

Context:
${context ? this.safeStringify(context) : 'No context provided'}
${'='.repeat(100)}
`;
    this.writeToFile(`error-details-${dateStr}.log`, errorDetail);
  }

  /**
   * Finish job logging
   */
  finishJobLogging(result: {
    status: 'COMPLETED' | 'FAILED';
    totalUsers?: number;
    processedUsers?: number;
    skippedUsers?: number;
    totalTrades?: number;
    totalAmount?: number;
    additionalData?: any;
  }): void {
    if (!this.currentJobId || !this.jobStartTime) return;

    const endTime = new Date();
    const duration = endTime.getTime() - this.jobStartTime.getTime();
    const durationSec = (duration / 1000).toFixed(2);

    // Create job summary
    const jobSummary = `
${'='.repeat(100)}
📊 JOB EXECUTION SUMMARY
${'='.repeat(100)}
Job ID:           ${this.currentJobId}
Status:           ${result.status}
Start Time:       ${this.jobStartTime.toISOString()}
End Time:         ${endTime.toISOString()}
Duration:         ${durationSec} seconds

📈 STATISTICS:
- Total Users:       ${result.totalUsers || 0}
- Processed Users:   ${result.processedUsers || 0}
- Skipped Users:     ${result.skippedUsers || 0}
- Total Trades:      ${result.totalTrades || 0}
- Total Amount:      ${result.totalAmount || 0}

${result.additionalData ? `
📋 ADDITIONAL DATA:
${this.safeStringify(result.additionalData)}
` : ''}

📝 EXECUTION LOGS:
${this.jobLogs.join('\n')}

${'='.repeat(100)}
END OF JOB ${this.currentJobId}
${'='.repeat(100)}
`;

    // Save job-specific log file
    const dateStr = new Date().toISOString().split('T')[0];
    this.writeToFile(`job-${this.currentJobId}-${dateStr}.log`, jobSummary);
    
    this.success(`Job ${this.currentJobId} completed with status: ${result.status}`);

    // Reset
    this.currentJobId = undefined;
    this.jobLogs = [];
    this.jobStartTime = undefined;
  }
}

// Export singleton
export const logger = new Logger();