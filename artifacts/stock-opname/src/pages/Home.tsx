import React, { useState, useMemo, useCallback } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useStoreName } from '@/hooks/useStoreName';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { ProductManager } from '@/components/ProductManager';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Cloud,
  Clock3,
  PackageSearch,
  QrCode,
  RefreshCw,
  RotateCcw,
  Send,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListStockEntriesQueryKey,
  useCreateStockEntry,
  useListStockEntries,
  useRetryStockEntrySync,
  type StockEntry,
} from '@workspace/api-client-react';

const TRANSACTIONS = [
  'Stock Opname',
  'Stock Awal',
  'Penjualan',
  'Pembelian',
  'Retur',
  'Lainnya'
];

export default function Home() {
  const { products, addProduct, removeProduct, updateProduct, replaceProducts } = useProducts();
  const [storeName, setStoreName] = useStoreName();
  const { toast } = useToast();

  const [transaction, setTransaction] = useState(TRANSACTIONS[0]);
  const [selectedBarcode, setSelectedBarcode] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [displayQuantity, setDisplayQuantity] = useState<number | ''>('');
  const [secondaryDisplayQuantity, setSecondaryDisplayQuantity] = useState<number | ''>('');
  const [warehouseQuantity, setWarehouseQuantity] = useState<number | ''>('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const queryClient = useQueryClient();
  const isStockOpname = transaction === 'Stock Opname';
  const totalStock = useMemo(
    () =>
      Number(displayQuantity || 0) +
      Number(secondaryDisplayQuantity || 0) +
      Number(warehouseQuantity || 0),
    [displayQuantity, secondaryDisplayQuantity, warehouseQuantity],
  );

  const { data: recentEntries = [], isLoading: isRecentLoading } = useListStockEntries(
    { store: storeName || undefined, limit: 5 },
    {
      query: {
        queryKey: getListStockEntriesQueryKey({ store: storeName || undefined, limit: 5 }),
        refetchInterval: 5000,
      },
    },
  );

  const retryMutation = useRetryStockEntrySync({
    mutation: {
      onSuccess: (entry) => {
        queryClient.invalidateQueries({ queryKey: getListStockEntriesQueryKey() });
        toast({
          title: entry.syncStatus === 'synced' ? 'Berhasil Sinkron' : 'Belum Tersinkron',
          description:
            entry.syncStatus === 'synced'
              ? 'Data berhasil dikirim ulang ke Google Sheets.'
              : 'Server tetap menyimpan data, tetapi spreadsheet belum menerima data.',
          variant: entry.syncStatus === 'synced' ? 'default' : 'destructive',
        });
      },
      onError: (err: any) => {
        toast({
          title: 'Gagal Sinkron',
          description: err.message || 'Data tetap aman di server dan dapat dicoba lagi.',
          variant: 'destructive',
        });
      },
    },
  });

  const submitMutation = useCreateStockEntry({
    mutation: {
      onSuccess: (entry) => {
        queryClient.invalidateQueries({ queryKey: getListStockEntriesQueryKey() });
        if (entry.syncStatus === 'synced') {
          toast({
            title: 'Tersimpan & Tersinkron',
            description: 'Data sudah tersimpan di server dan Google Sheets.',
          });
        } else {
          toast({
            title: 'Tersimpan di Server',
            description: 'Spreadsheet belum menerima data. Anda bisa mencoba sinkron ulang dari daftar transaksi.',
            variant: 'destructive',
          });
        }
        setQuantity('');
        setDisplayQuantity('');
        setSecondaryDisplayQuantity('');
        setWarehouseQuantity('');
      },
      onError: (err: any) => {
      toast({
        title: 'Gagal Menyimpan ke Server',
        description: err.message || 'Data belum tersimpan. Silakan coba lagi.',
        variant: 'destructive',
      });
      },
    },
  });

  const getPayload = () => {
    const product = products.find(p => p.barcode === selectedBarcode);
    return {
      clientId: globalThis.crypto.randomUUID(),
      store: storeName,
      transaction,
      product: product ? product.name : '',
      quantity: isStockOpname ? totalStock : Number(quantity),
      barcode: selectedBarcode,
      displayQuantity: isStockOpname ? Number(displayQuantity || 0) : 0,
      secondaryDisplayQuantity: isStockOpname ? Number(secondaryDisplayQuantity || 0) : 0,
      warehouseQuantity: isStockOpname ? Number(warehouseQuantity || 0) : 0,
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasNoStockInput = isStockOpname
      ? displayQuantity === '' && secondaryDisplayQuantity === '' && warehouseQuantity === ''
      : quantity === '';

    if (!storeName || !transaction || !selectedBarcode || hasNoStockInput) {
      toast({
        title: 'Peringatan',
        description: isStockOpname
          ? 'Masukkan jumlah Display, Secondary Display, atau Gudang.'
          : 'Mohon lengkapi semua form.',
        variant: 'destructive'
      });
      return;
    }
    submitMutation.mutate({ data: getPayload() });
  };

  const handleScanSuccess = useCallback((code: string) => {
    setIsScannerOpen(false);
    const product = products.find(p => p.barcode === code);
    if (product) {
      setSelectedBarcode(product.barcode);
      toast({
        title: 'Barcode Ditemukan',
        description: `Produk: ${product.name}`,
      });
    } else {
      toast({
        title: 'Barcode Tidak Dikenali',
        description: `${code}. Silakan pilih manual atau tambahkan produk baru.`,
        variant: 'destructive'
      });
      setSelectedBarcode('');
    }
  }, [products, toast]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category));
    return Array.from(cats).sort();
  }, [products]);

  const getSyncMeta = (entry: StockEntry) => {
    if (entry.syncStatus === 'synced') {
      return {
        label: 'Tersinkron',
        icon: CheckCircle2,
        className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      };
    }
    if (entry.syncStatus === 'failed') {
      return {
        label: 'Perlu dicoba lagi',
        icon: AlertTriangle,
        className: 'text-amber-700 bg-amber-50 border-amber-200',
      };
    }
    return {
      label: 'Menunggu',
      icon: Clock3,
      className: 'text-slate-600 bg-slate-50 border-slate-200',
    };
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center pb-12">
      {/* Header */}
      <header className="w-full max-w-md bg-primary text-primary-foreground pt-10 pb-6 px-6 shadow-md rounded-b-3xl mb-6 sticky top-0 z-10">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-2xl font-serif font-bold tracking-tight">Erlangga</h1>
            <h2 className="text-sm text-primary-foreground/80 font-medium">Stock Opname</h2>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-full">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium">Ready</span>
          </div>
        </div>
      </header>

      <main className="w-full max-w-md px-4 flex-1 flex flex-col gap-6">
        <div className="bg-card border border-border shadow-sm rounded-2xl p-5 relative overflow-hidden">
          {/* Decorative accent blob */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-accent/10 rounded-full blur-2xl pointer-events-none" />
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 relative z-10">
            {/* Store Name */}
            <div className="space-y-1.5">
              <label htmlFor="store" className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Box size={16} className="text-muted-foreground" /> Nama Toko
              </label>
              <input
                id="store"
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-sm font-medium placeholder:text-muted-foreground/50"
                placeholder="Contoh: Toko Sentosa"
                required
              />
            </div>

            {/* Transaction Type */}
            <div className="space-y-1.5">
              <label htmlFor="transaction" className="text-sm font-semibold text-foreground flex items-center gap-2">
                <RefreshCw size={16} className="text-muted-foreground" /> Tipe Transaksi
              </label>
              <div className="relative">
                <select
                  id="transaction"
                  value={transaction}
                  onChange={(e) => setTransaction(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-sm appearance-none font-medium"
                  required
                >
                  {TRANSACTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
                  <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Product Select with Scanner */}
            <div className="space-y-1.5">
              <label htmlFor="product" className="text-sm font-semibold text-foreground flex items-center gap-2">
                <PackageSearch size={16} className="text-muted-foreground" /> Produk
              </label>
              
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    id="product"
                    value={selectedBarcode}
                    onChange={(e) => setSelectedBarcode(e.target.value)}
                    className="w-full h-[46px] px-4 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-sm appearance-none font-medium pr-8 truncate"
                    required
                  >
                    <option value="" disabled>Pilih Produk...</option>
                    {categories.map(cat => (
                      <optgroup key={cat} label={cat}>
                        {products.filter(p => p.category === cat).map(p => (
                          <option key={p.barcode} value={p.barcode}>{p.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
                    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className={`flex-none w-[46px] h-[46px] bg-accent text-accent-foreground rounded-xl shadow-sm hover:brightness-110 transition-all active:scale-95 flex items-center justify-center ${isScannerOpen ? 'animate-pulse' : ''}`}
                  aria-label="Scan Barcode"
                >
                  <QrCode size={22} />
                </button>
              </div>
              {selectedBarcode && (
                <p className="text-xs text-muted-foreground px-1 font-mono">Barcode: {selectedBarcode}</p>
              )}
            </div>

            {/* Quantity */}
            {isStockOpname ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="display-quantity" className="text-sm font-semibold text-foreground">
                      Display
                    </label>
                    <input
                      id="display-quantity"
                      type="number"
                      min="0"
                      step="1"
                      value={displayQuantity}
                      onChange={(e) => setDisplayQuantity(e.target.value ? parseInt(e.target.value, 10) : '')}
                      className="w-full px-3 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-xl font-bold tracking-tight text-center"
                      placeholder="0"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="secondary-display-quantity" className="text-sm font-semibold text-foreground">
                      Secondary Display
                    </label>
                    <input
                      id="secondary-display-quantity"
                      type="number"
                      min="0"
                      step="1"
                      value={secondaryDisplayQuantity}
                      onChange={(e) => setSecondaryDisplayQuantity(e.target.value ? parseInt(e.target.value, 10) : '')}
                      className="w-full px-3 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-xl font-bold tracking-tight text-center"
                      placeholder="0"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="warehouse-quantity" className="text-sm font-semibold text-foreground">
                      Gudang
                    </label>
                    <input
                      id="warehouse-quantity"
                      type="number"
                      min="0"
                      step="1"
                      value={warehouseQuantity}
                      onChange={(e) => setWarehouseQuantity(e.target.value ? parseInt(e.target.value, 10) : '')}
                      className="w-full px-3 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-xl font-bold tracking-tight text-center"
                      placeholder="0"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Total Stok</p>
                    <p className="text-xs text-muted-foreground">Display + Secondary Display + Gudang</p>
                  </div>
                  <span className="text-2xl font-bold tracking-tight text-primary">{totalStock}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="quantity" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  Jumlah Stok
                </label>
                <input
                  id="quantity"
                  type="number"
                  min="0"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value ? parseInt(e.target.value, 10) : '')}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-xl font-bold tracking-tight text-center"
                  placeholder="0"
                  required
                />
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="w-full mt-2 py-3.5 bg-primary text-primary-foreground font-semibold rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 text-lg group"
            >
              {submitMutation.isPending ? (
                <>
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Send size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  Simpan Data
                </>
              )}
            </button>
          </form>
        </div>

        <ProductManager 
          products={products} 
          onAdd={addProduct} 
          onRemove={removeProduct} 
          onUpdate={updateProduct}
          onReplace={replaceProducts}
        />

        <section className="bg-card border border-border shadow-sm rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Cloud size={18} className="text-primary" />
                <h2 className="font-serif text-lg font-bold text-foreground">Backup Server</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Data terbaru diperbarui otomatis setiap beberapa detik.
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground border border-border rounded-full px-2 py-1">
              Live
            </span>
          </div>

          {isRecentLoading ? (
            <div className="text-sm text-muted-foreground py-3">Memuat data server...</div>
          ) : recentEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center">
              <p className="text-sm font-medium text-foreground">Belum ada transaksi tersimpan</p>
              <p className="text-xs text-muted-foreground mt-1">
                Setiap data yang disimpan akan muncul di sini.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentEntries.map((entry) => {
                const syncMeta = getSyncMeta(entry);
                const SyncIcon = syncMeta.icon;
                return (
                  <div key={entry.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{entry.product}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {entry.transaction} · {entry.quantity} stok ·{' '}
                          {new Date(entry.createdAt).toLocaleString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${syncMeta.className}`}>
                        <SyncIcon size={12} />
                        {syncMeta.label}
                      </span>
                    </div>
                    {entry.syncStatus === 'failed' && (
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                        <p className="text-xs text-muted-foreground">
                          Server sudah menyimpan data ini.
                        </p>
                        <button
                          type="button"
                          onClick={() => retryMutation.mutate({ id: entry.id })}
                          disabled={retryMutation.isPending}
                          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                          <RotateCcw size={13} />
                          Coba Lagi
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <BarcodeScanner 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScanSuccess={handleScanSuccess} 
      />
    </div>
  );
}
