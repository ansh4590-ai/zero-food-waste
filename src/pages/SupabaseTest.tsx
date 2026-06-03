import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Database, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export default function SupabaseTest() {
  const [data, setData] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function testConnection() {
      try {
        // Attempt to fetch from the test table we specified in our SQL
        const { data: testData, error: dbError } = await supabase
          .from('connection_tests')
          .select('*')
          .limit(5);

        if (dbError) throw dbError;
        
        setData(testData || []);
      } catch (err: unknown) {
        /* console.error('Database connection error:', (err as Error).message); removed for security */
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    testConnection();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-xl w-full bg-card border border-border shadow-2xl rounded-2xl p-8 mb-8">
        <div className="flex items-center gap-3 mb-6 border-b border-border pb-6">
          <div className="bg-emerald-100 dark:bg-emerald-900/30 p-3 rounded-xl border border-emerald-500/20">
            <Database className="w-8 h-8 text-emerald-600 dark:text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Supabase Pipeline Test</h1>
            <p className="text-muted-foreground text-sm">Verifying frontend-to-Postgres connection.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            <p className="text-sm font-medium text-muted-foreground">Contacting database...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-6">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-red-900 dark:text-red-400">Connection Failed</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1 mb-3">
                  {error}
                </p>
                <div className="text-xs text-red-600/80 dark:text-red-400/80 p-3 bg-red-100/50 dark:bg-red-900/20 rounded-md">
                  <p className="font-semibold mb-1">Troubleshooting Checklist:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Did you add your keys to the `.env` file?</li>
                    <li>Did you restart the `npm run dev` server?</li>
                    <li>Did you execute the SQL script in your Supabase dashboard?</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-xl p-6">
             <div className="flex gap-3 mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-green-900 dark:text-green-400">Connection Successful!</h3>
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  We successfully retrieved data directly from your Supabase PostgreSQL cluster.
                </p>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-green-200/50 dark:border-green-900/50">
              <h4 className="text-xs font-semibold text-green-800 dark:text-green-500 uppercase tracking-wider mb-3">Test Data Payload</h4>
              
              {data && data.length > 0 ? (
                <div className="space-y-3">
                  {data.map((row) => (
                    <div key={row.id} className="bg-white/50 dark:bg-black/20 p-3 rounded-lg text-sm font-mono text-green-900 dark:text-green-300">
                      ID: {row.id} <br/> Msg: {row.message || 'No message'}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-green-700/80 dark:text-green-300/80 italic">
                  Connection succeeded, but the table returned 0 rows. Please make sure you inserted the test row.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
