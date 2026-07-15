import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/layout/sidebar';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { getRuntimeEnv } from '@/lib/runtime-env';
import { createApiClient } from '@/lib/api-client';

const DEFAULT_METABASE_URL = 'http://localhost:3030';
const apiClient = createApiClient();

export function DashboardPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [iframeUrl, setIframeUrl] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const configuredUrl = getRuntimeEnv('VITE_METABASE_URL');
    const fallbackMetabaseUrl =
        typeof configuredUrl === 'string' && configuredUrl.trim().length > 0
            ? configuredUrl
            : DEFAULT_METABASE_URL;

    React.useEffect(() => {
        let mounted = true;

        async function loadSignedDashboardUrl() {
            try {
                const response = await apiClient.get<{ iframeUrl: string }>('/api/v1/metabase/dashboard-url');
                if (!mounted) return;
                setIframeUrl(response.data.iframeUrl);
            } catch {
                if (!mounted) return;
                setIframeUrl(fallbackMetabaseUrl);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        loadSignedDashboardUrl();
        return () => {
            mounted = false;
        };
    }, [fallbackMetabaseUrl]);

    const resolvedIframeUrl = iframeUrl ?? fallbackMetabaseUrl;

    return (
        <TooltipProvider>
            <SidebarProvider>
                <AppSidebar
                    domains={[]}
                    selectedDomain={null}
                    onDomainSelect={() => undefined}
                />
                <div className="flex h-svh flex-1 flex-col">
                    <main className="flex-1 overflow-y-auto p-4 sm:p-6">
                        <section className="mx-auto flex h-full w-full max-w-7xl flex-col gap-3">
                            <div className="flex items-center justify-between gap-3">
                                <h1 className="text-2xl font-semibold tracking-tight">{t('nav.dashboard')}</h1>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate('/')}
                                    className="gap-2"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    {t('dashboard.back_home')}
                                </Button>
                            </div>
                            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                                {loading && (
                                    <div className="flex h-[76vh] min-h-[460px] w-full items-center justify-center text-sm text-muted-foreground">
                                        {t('dashboard.loading')}
                                    </div>
                                )}
                                <iframe
                                    title={t('nav.dashboard')}
                                    src={resolvedIframeUrl}
                                    className={loading ? 'hidden' : 'h-[76vh] min-h-[460px] w-full'}
                                    loading="lazy"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                />
                            </div>
                        </section>
                    </main>
                </div>
            </SidebarProvider>
        </TooltipProvider>
    );
}