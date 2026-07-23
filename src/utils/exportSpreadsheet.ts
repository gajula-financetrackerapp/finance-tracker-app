import type { CashBooksState, Transaction } from '../types';

function csvEscape(value: string | number | boolean | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function xmlEscape(value: string | number | boolean | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function accountName(cashBooks: CashBooksState, bookId: string, accountId?: string): string {
  const book = cashBooks.books.find((b) => b.id === bookId);
  if (!book || !accountId) return '';
  return book.finance.accounts.find((a) => a.id === accountId)?.name || '';
}

type FlatTxn = {
  book: string;
  date: string;
  kind: string;
  category: string;
  amount: number;
  note: string;
  account: string;
  fromAccount: string;
  toAccount: string;
  itemName: string;
  quantity: string;
};

function flattenTransactions(cashBooks: CashBooksState): FlatTxn[] {
  const rows: FlatTxn[] = [];
  for (const book of cashBooks.books) {
    if (book.archived) continue;
    for (const t of book.finance.transactions) {
      rows.push({
        book: book.name,
        date: t.date || '',
        kind: t.kind,
        category: t.category || '',
        amount: t.amount,
        note: t.note || '',
        account: accountName(cashBooks, book.id, t.accountId),
        fromAccount: accountName(cashBooks, book.id, t.fromAccountId),
        toAccount: accountName(cashBooks, book.id, t.toAccountId),
        itemName: t.itemName || '',
        quantity: t.quantity || '',
      });
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.book.localeCompare(b.book));
  return rows;
}

function flattenAccounts(cashBooks: CashBooksState) {
  const rows: {
    book: string;
    name: string;
    type: string;
    balance: number;
    currency: string;
    excluded: string;
    default: string;
  }[] = [];
  for (const book of cashBooks.books) {
    if (book.archived) continue;
    const defaultId = book.finance.defaultAccountId;
    for (const a of book.finance.accounts) {
      rows.push({
        book: book.name,
        name: a.name,
        type: a.type || '',
        balance: a.amount,
        currency: a.currency || '',
        excluded: a.excluded ? 'yes' : 'no',
        default: a.id === defaultId ? 'yes' : 'no',
      });
    }
  }
  return rows;
}

const TXN_HEADERS = [
  'Book',
  'Date',
  'Type',
  'Category',
  'Amount',
  'Note',
  'Account',
  'From Account',
  'To Account',
  'Item',
  'Quantity',
] as const;

/** CSV with UTF-8 BOM so Excel opens Indian/Unicode text correctly. */
export function buildExportCsv(cashBooks: CashBooksState): string {
  const txns = flattenTransactions(cashBooks);
  const lines = [
    TXN_HEADERS.join(','),
    ...txns.map((r) =>
      [
        r.book,
        r.date,
        r.kind,
        r.category,
        r.amount,
        r.note,
        r.account,
        r.fromAccount,
        r.toAccount,
        r.itemName,
        r.quantity,
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

/** Excel-readable SpreadsheetML (.xls) with Transactions + Accounts sheets. */
export function buildExportXls(cashBooks: CashBooksState): string {
  const txns = flattenTransactions(cashBooks);
  const accounts = flattenAccounts(cashBooks);

  const txnRows = [
    xmlRow(TXN_HEADERS.map((h) => xmlCell(h, 'String'))),
    ...txns.map((r) =>
      xmlRow([
        xmlCell(r.book, 'String'),
        xmlCell(r.date, 'String'),
        xmlCell(r.kind, 'String'),
        xmlCell(r.category, 'String'),
        xmlCell(r.amount, 'Number'),
        xmlCell(r.note, 'String'),
        xmlCell(r.account, 'String'),
        xmlCell(r.fromAccount, 'String'),
        xmlCell(r.toAccount, 'String'),
        xmlCell(r.itemName, 'String'),
        xmlCell(r.quantity, 'String'),
      ]),
    ),
  ].join('');

  const accHeaders = ['Book', 'Name', 'Type', 'Balance', 'Currency', 'Excluded', 'Default'];
  const accRows = [
    xmlRow(accHeaders.map((h) => xmlCell(h, 'String'))),
    ...accounts.map((r) =>
      xmlRow([
        xmlCell(r.book, 'String'),
        xmlCell(r.name, 'String'),
        xmlCell(r.type, 'String'),
        xmlCell(r.balance, 'Number'),
        xmlCell(r.currency, 'String'),
        xmlCell(r.excluded, 'String'),
        xmlCell(r.default, 'String'),
      ]),
    ),
  ].join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Transactions">
  <Table>${txnRows}</Table>
 </Worksheet>
 <Worksheet ss:Name="Accounts">
  <Table>${accRows}</Table>
 </Worksheet>
</Workbook>`;
}

function xmlCell(value: string | number, type: 'String' | 'Number'): string {
  return `<Cell><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
}

function xmlRow(cells: string[]): string {
  return `<Row>${cells.join('')}</Row>`;
}

export function exportFileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export type ExportFormat = 'csv' | 'xls';

export function buildExportContent(
  cashBooks: CashBooksState,
  format: ExportFormat,
): { content: string; filename: string; mimeType: string; uti: string } {
  const stamp = exportFileStamp();
  if (format === 'csv') {
    return {
      content: buildExportCsv(cashBooks),
      filename: `pulse-wallet-${stamp}.csv`,
      mimeType: 'text/csv',
      uti: 'public.comma-separated-values-text',
    };
  }
  return {
    content: buildExportXls(cashBooks),
    filename: `pulse-wallet-${stamp}.xls`,
    mimeType: 'application/vnd.ms-excel',
    uti: 'com.microsoft.excel.xls',
  };
}

/** Count of exportable transactions (active books). */
export function countExportTransactions(cashBooks: CashBooksState): number {
  return flattenTransactions(cashBooks).length;
}

export type { Transaction };
