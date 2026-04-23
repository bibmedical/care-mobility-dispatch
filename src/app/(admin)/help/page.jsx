import PageTitle from '@/components/PageTitle';
import Link from 'next/link';
import { Badge, Card, CardBody, Col, Row, Table } from 'react-bootstrap';

export const metadata = {
  title: 'Diarie'
};

const HELP_ENTRIES = [{
  module: 'Avatar',
  route: '/avatar',
  instruction: 'Manage the visual profile and quick data of the active user.'
}, {
  module: 'Black List',
  route: '/blacklist',
  instruction: 'Review blocked passengers, reasons and restriction status.'
}, {
  module: 'Confirmation',
  route: '/confirmation',
  instruction: 'Trigger confirmations and verify passenger response queue.'
}, {
  module: 'Daily Driver Snapshot',
  route: '/daily-driver-snapshot',
  instruction: 'View daily driver snapshot with status, checkpoint, trips and shift performance.'
}, {
  module: 'Dispatcher',
  route: '/dispatcher',
  instruction: 'Assign trips, apply map filters, and monitor drivers live.'
}, {
  module: 'Driver Efficiency Report',
  route: '/driver-efficiency-report',
  instruction: 'Measure efficiency by block, idle time and compliance.'
}, {
  module: 'Drivers',
  route: '/drivers',
  instruction: 'Edit drivers, licenses and operational availability status.'
}, {
  module: 'Email Templates',
  route: '/settings/email-templates',
  instruction: 'Update templates for alerts, expirations and automated messages.'
}, {
  module: 'Excel Loader',
  route: '/forms-safe-ride-import',
  instruction: 'Import SafeRide trips from Excel/CSV and validate errors before saving.'
}, {
  module: 'Full Shift Analysis',
  route: '/full-shift-analysis',
  instruction: 'Analyze the full shift by routes, times and productivity.'
}, {
  module: 'Office Settings',
  route: '/settings/office',
  instruction: 'Configure office data, contact info and operational parameters.'
}, {
  module: 'Preferences',
  route: '/preferences',
  instruction: 'Adjust interface behavior, tables and saved views.'
}, {
  module: 'Primary Dashboard',
  route: '/trip-analytics',
  instruction: 'Monitor key KPIs and trip volume by status.'
}, {
  module: 'Rates',
  route: '/rates',
  instruction: 'Manage rates by service type, trip type and conditions.'
}, {
  module: 'SMS Integrations',
  route: '/integrations/sms',
  instruction: 'Send manual/automatic messages and review delivery status.'
}, {
  module: 'System Messages',
  route: '/system-messages',
  instruction: 'Schedule internal alerts and track critical notifications.'
}, {
  module: 'Trip Dashboard',
  route: '/trip-dashboard',
  instruction: 'Build visual routes, select trips and control the map panel.'
}, {
  module: 'User Management',
  route: '/user-management',
  instruction: 'Create users, define roles, access levels and inactivity timeouts.'
}, {
  module: 'Vehicles',
  route: '/drivers/vehicles',
  instruction: 'Register vehicles, documents and capacity per unit.'
}].sort((a, b) => a.module.localeCompare(b.module, 'en', {
  sensitivity: 'base'
}));

const QUICK_FLOW = [{
  step: '1. Log in',
  detail: 'Sign in with your username or email and active password.'
}, {
  step: '2. Dispatcher',
  detail: 'Filter and select trips; validate the selected-trips count at the top.'
}, {
  step: '3. Route/Clear',
  detail: 'Build a route, clear selection or focus the map by city/ZIP.'
}, {
  step: '4. Confirmations',
  detail: 'Send confirmation SMS or custom messages as needed.'
}, {
  step: '5. Review messages',
  detail: 'Check internal alerts and operational notifications in System Messages.'
}];

const ENGINE_FLOW = [{
  stage: '1. SafeRide / Excel intake',
  detail: 'Trips enter through Excel Loader or the Trip Dashboard import workflow. The file is parsed first and service dates are detected before anything is merged into operations.'
}, {
  stage: '2. Inconsistency scan',
  detail: 'The import review step identifies duplicates, missing driver names, bad dates, cancelled records and other mismatches before the trips are accepted.'
}, {
  stage: '3. Shared dispatch tree update',
  detail: 'Accepted trips are merged into the same shared dispatch tree used by Dispatcher, Trip Dashboard, Messaging, confirmation tools and driver-facing workflows.'
}, {
  stage: '4. Confirmation + rider changes',
  detail: 'Confirmation responses, call results, schedule changes, notes, will-call changes and cancellations update the same trip records instead of creating separate copies.'
}, {
  stage: '5. Route building',
  detail: 'Dispatcher and Trip Dashboard create or edit routes by linking tripIds, routeId, driverId and secondaryDriverId inside the same operational tree.'
}, {
  stage: '6. Live operations',
  detail: 'Dispatcher monitors live drivers, messages, route progress and trip status while Trip Dashboard focuses on trip selection, route shaping and visual control.'
}, {
  stage: '7. Driver execution',
  detail: 'Driver actions in the field feed completion, enroute, onboard, arrival, cancellation and messaging updates back into the same dispatch tree.'
}, {
  stage: '8. SQL persistence',
  detail: 'The shared dispatch tree is persisted to SQL as the main operational state. Trips, route plans, threads, daily drivers and audit data all depend on that shared state.'
}, {
  stage: '9. Archive + history',
  detail: 'Older days can be archived into dispatch history so the current live state stays operational while past days remain recoverable.'
}, {
  stage: '10. Cross-screen consumption',
  detail: 'Dispatcher, Trip Dashboard, driver tools, AI assistant, system messages, reports and confirmation tools all read from connected data. A bad unlink in one place can affect other modules later.'
}];

const SHARED_TREE_MAP = [{
  area: 'Excel Loader / Import',
  role: 'Creates or updates trip records that later feed Dispatcher and Trip Dashboard.'
}, {
  area: 'Dispatcher',
  role: 'Runs the live shift: assignments, driver focus, route monitoring, cancellations, trip messaging and end-of-day control.'
}, {
  area: 'Trip Dashboard',
  role: 'Works on the same trips and routes, but optimized for trip filtering, route shaping, map work and focused route planning.'
}, {
  area: 'Confirmation tools',
  role: 'Writes confirmation status, notes, response codes, trip updates and cancellation outcomes back into shared trips.'
}, {
  area: 'Messaging / Driver communications',
  role: 'Uses the same trip and driver context so route notes, will-calls, updates and operational messages stay connected.'
}, {
  area: 'Driver app / mobile actions',
  role: 'Reports what happened in the field and changes trip progress on the same operational tree.'
}, {
  area: 'AI / Assistant',
  role: 'Reads the shared dispatch tree to plan routes, focus drivers, answer questions and trigger connected actions.'
}, {
  area: 'SQL dispatch store',
  role: 'Persists the operational tree. If the tree is overwritten or pruned incorrectly, multiple modules can break together.'
}];

const CHANGE_SAFETY_RULES = [{
  rule: 'One source of truth',
  detail: 'Routes, trips, driver assignments, confirmation state and messaging context must come from the same shared dispatch tree. Do not create parallel page-local copies.'
}, {
  rule: 'New controls must stay in-flow',
  detail: 'Before adding a button, badge, panel or shortcut, identify which workspace owns that action already. Add the control inside the existing flow instead of creating a new disconnected spot that duplicates or bypasses the normal operator path.'
}, {
  rule: 'State consequences before building',
  detail: 'Any new UI control must be evaluated for its impact on Dispatcher, Trip Dashboard, messaging, imports, persistence, and performance before it is added. If the consequence is unclear, scan first and document the risk before coding.'
}, {
  rule: 'UI fix is not enough',
  detail: 'A visual fix in Dispatcher can still break Trip Dashboard later if it changes shared IDs, route links or persisted trip structure.'
}, {
  rule: 'Imports must merge, not destroy',
  detail: 'Reimport should preserve valid route and driver relationships unless there is an explicit admin operation to clear or delete them.'
}, {
  rule: 'Route integrity matters',
  detail: 'If tripIds, routeId, driverId or secondaryDriverId are cleared or mismatched, Trip Dashboard, Dispatcher and driver workflows can all drift apart.'
}, {
  rule: 'Every change needs cross-screen thinking',
  detail: 'Before changing Dispatcher, check Trip Dashboard, confirmation, messaging, driver actions and SQL persistence because they depend on the same engine.'
}];

const UI_CHANGE_GUARDRAILS = [{
  step: '1. Find the owner workspace',
  detail: 'Decide whether the action belongs in Dispatcher, Trip Dashboard, Help, Messaging, import review, or another existing module. Do not create a second home for the same action unless there is a clear operational reason.'
}, {
  step: '2. Check the existing flow first',
  detail: 'If operators already perform that action in a toolbar, panel, modal or table, extend that same flow. Random placement creates confusion and usually causes duplicate logic later.'
}, {
  step: '3. State the consequences up front',
  detail: 'Before coding, list what the new button or control can affect: date scope, route links, selected trips, SQL persistence, refresh behavior, memory usage, and other screens that read the same state.'
}, {
  step: '4. Prefer reuse over invention',
  detail: 'Wire the new control to existing shared context actions and existing API paths instead of creating new page-local state, extra loaders, or separate hidden behavior.'
}, {
  step: '5. Validate both core workspaces',
  detail: 'A change that looks correct in one screen can still break the other. Verify Dispatcher and Trip Dashboard together before calling the UI change safe.'
}];

const CHANGE_REQUEST_PROTOCOL = [{
  part: 'Part 1. Understand the real request',
  detail: 'Do not start by drawing UI. First identify the operational goal: is the user asking for a new action, a shortcut to an existing action, a visibility fix, a filter, a date-scope change, or a persistence change? Many requests that sound like a button request are actually route, date, memory, or shared-state problems.'
}, {
  part: 'Part 2. Name the owner before coding',
  detail: 'Every new control must have one owner workspace. Dispatcher owns live day execution and closing control. Trip Dashboard owns visual trip filtering, route shaping, and map-oriented planning. Help owns explanation and navigation. Import pages own intake/review. Do not place an operational control in Help or a documentation shortcut inside a destructive import flow.'
}, {
  part: 'Part 3. Reuse existing flow first',
  detail: 'Before creating a new button, check whether the same action already exists in a toolbar, panel, modal, route card, context action, or menu. If it exists, extend that flow instead of creating a second disconnected entry point. Duplicate entry points create duplicate state, duplicate expectations, and broken operator habits.'
}, {
  part: 'Part 4. State consequences before implementation',
  detail: 'The person making the change should explain the likely consequences before coding: what trips, routes, selected-trip state, driver assignments, SQL persistence, refresh behavior, memory use, and cross-screen visibility could be affected. If the consequences are unknown, scan first. Do not guess.'
}, {
  part: 'Part 5. Prefer the shared tree',
  detail: 'If a change needs data or actions, wire it to the shared dispatch tree and existing context actions when possible. Do not create a page-local mini-engine, a shadow import path, or a one-off state shape that only one screen understands.'
}, {
  part: 'Part 6. Keep date loading intentional',
  detail: 'Operational screens should load the selected day or a small operational window, not all history at once. If a request changes date behavior, explain what should load for all, for a selected date, and for yesterday/today/tomorrow before coding.'
}, {
  part: 'Part 7. Validate in both directions',
  detail: 'After a change, verify that Dispatcher did not break Trip Dashboard and that Trip Dashboard did not break Dispatcher. Also verify imports, persistence, and route visibility if the change touches trips, routes, dates, or filters.'
}, {
  part: 'Part 8. Deploy only after local proof',
  detail: 'The safe order is local scan, minimal code change, error validation, local behavior verification, then push/deploy. Do not rely on Render to tell you the architecture was wrong after the fact.'
}];

const BUTTON_PLACEMENT_RULES = [{
  rule: 'If the button triggers an existing action, place it near that action.',
  consequence: 'Putting it elsewhere creates a second mental model and usually leads to duplicate logic or missing side effects.'
}, {
  rule: 'If the button changes shared trip or route state, it belongs in an operational workspace, not in a decorative or documentation area.',
  consequence: 'A disconnected placement hides real side effects and makes later debugging harder.'
}, {
  rule: 'If the button is only a shortcut to documentation, it should point into Help and not duplicate operational behavior.',
  consequence: 'Help should explain the engine; it should not become a second dispatcher.'
}, {
  rule: 'If the button needs selected trips, selected route, selected driver, or current date scope, it must live where that context already exists.',
  consequence: 'Rebuilding selection context in a second place usually causes stale state and cross-screen drift.'
}, {
  rule: 'If placement feels convenient but not owned, stop and explain the tradeoff first.',
  consequence: 'Convenience-only placement is one of the fastest ways to create flow damage.'
}];

const CONSEQUENCE_SCAN_CHECKLIST = [{
  area: 'Flow ownership',
  check: 'Which existing workspace owns this action today?'
}, {
  area: 'Shared state',
  check: 'Will this touch trips, routes, drivers, selected-trip state, messages, or UI preferences?'
}, {
  area: 'Persistence',
  check: 'Could this clear, overwrite, shrink, or desync SQL-backed dispatch state?'
}, {
  area: 'Date scope',
  check: 'Does this change what days load, what days stay visible, or what all means?'
}, {
  area: 'Performance',
  check: 'Does this add polling, repeated refreshes, large payload merges, or expensive derived filters?'
}, {
  area: 'Cross-screen behavior',
  check: 'Could this look correct in one screen but break another screen later?'
}, {
  area: 'Operator expectation',
  check: 'Will an operator know where to find this action again tomorrow without learning a second workflow?'
}];

const DEPLOY_DISCIPLINE = [{
  step: '1. Scan first',
  detail: 'Read the current flow, owner workspace, and existing action path before editing.'
}, {
  step: '2. Explain the consequence',
  detail: 'Write or state what can be affected before creating the new UI or behavior.'
}, {
  step: '3. Make the smallest correct change',
  detail: 'Prefer wiring into existing controls, state, and APIs over inventing new paths.'
}, {
  step: '4. Validate locally',
  detail: 'Check for errors and verify the affected workflows in both core workspaces.'
}, {
  step: '5. Push only the relevant files',
  detail: 'Do not stage unrelated files when shipping a targeted fix or feature.'
}, {
  step: '6. Deploy after proof',
  detail: 'Render should receive a verified change, not be used as the first architecture test.'
}];

const WEB_RECOVERY_2026_04_16 = [{
  area: 'Trip visibility recovery',
  detail: 'Dispatcher and Trip Dashboard were corrected so selected operational dates show the intended live trips again instead of hiding valid day records behind date/load scope mistakes.'
}, {
  area: 'Route preservation',
  detail: 'Route links were preserved across trip reimports so existing route work would not disappear just because a new file merge arrived.'
}, {
  area: 'Route counting fallback',
  detail: 'Trip Dashboard was updated to derive visible route counts from visible trips when route-plan-only counting was not sufficient.'
}, {
  area: 'Dispatch load scoping',
  detail: 'Dispatch loading was limited to the active operational date window and refresh loops were reduced so the UI stopped fighting its own state.'
}, {
  area: 'Shared dispatch sync',
  detail: 'Shared dispatch state and driver thread sync were tightened so Dispatcher and Trip Dashboard stay closer to the same operational tree.'
}];

const SAFE_DEPLOY_NOTE = [{
  step: 'Safe deploy type',
  detail: 'A Help-page-only deploy is the safest deploy because it documents the system without touching trips, routes, imports, assignments, or SQL dispatch state.'
}, {
  step: 'Unsafe deploy type',
  detail: 'A deploy that changes dispatch import, route assignment, trip merge, pruning, or shared dispatch persistence can move or hide trips if it is not fully validated first.'
}, {
  step: 'Required order',
  detail: 'For operational fixes, the safe order is backup, local review, minimal code change, error check, workflow verification, then manual deploy only after proof.'
}, {
  step: 'Trip safety rule',
  detail: 'Do not ship route/import/persistence changes together with unrelated messaging or UI adjustments. Isolate the smallest fix so trips do not move unexpectedly.'
}];

const MANUAL_TRIP_ENTRY_2026_04_16 = [{
  area: 'Shared creation path',
  detail: 'Trip Dashboard and Dispatcher now open the same manual-trip modal and both write through one shared context mutation instead of inventing separate local flows.'
}, {
  area: 'Toolbar buttons',
  detail: 'A new +Trip button was added in the main action toolbar of Trip Dashboard and Dispatcher so operators can create the manual trip from either workspace using the same entry point.'
}, {
  area: 'SafeRide-style vehicle choice',
  detail: 'The manual-trip form now lets dispatch choose the service/car type with the same supported mobility codes the system already reads from SafeRide imports, including A, W, WXL, EW, Walker, and STR.'
}, {
  area: 'Import protection',
  detail: 'Manual trips are stamped with explicit protection flags so common import replace and date-clear flows do not wipe them out during later intake updates.'
}, {
  area: 'Operator placement',
  detail: 'The New Trip action lives in the main toolbar action area on both workspaces so dispatch can create a trip from either screen without hunting through row-level menus.'
}, {
  area: 'Local backup',
  detail: 'A local recovery snapshot was created before continuing this work: backup/SHEET-20260416-170133. Use it if any of the current local files need to be restored.'
}];

const DIARIO_2026_04_16 = [{
  area: 'Diario first read',
  detail: 'Help is the operating diary. Read this section first before touching manual trip entry, dispatch persistence, SQL behavior, or local-vs-production dispatch storage again.'
}, {
  area: 'SQL repair of today',
  detail: 'The production SQL path in nemt-dispatch-store was preserved as the real source of truth when DATABASE_URL exists. The repair added a development-only fallback so local Dispatcher no longer breaks or appears to lose trips just because SQL is unavailable on the machine.'
}, {
  area: 'What was included',
  detail: 'The uploaded web change set included the shared manual-trip modal, the +Trip buttons in Dispatcher and Trip Dashboard, protected manual-trip persistence, Help documentation, the assistant dispatch lazy-load safeguard, and the development-only local fallback in nemt-dispatch-store.'
}, {
  area: 'Trip deletion guard',
  detail: 'Manual trips are now marked with explicit protection flags and are preserved during import replacement and date-clear flows. This was added so trips created by dispatch do not get wiped out by later sync or intake cleanup.'
}, {
  area: 'Local fallback meaning',
  detail: 'The nemt-dispatch-store local fallback only activates outside production when DATABASE_URL is missing. It does not replace production SQL. It exists so the same local failure pattern does not repeat when SQL is absent during development.'
}, {
  area: 'What was not uploaded',
  detail: 'Unrelated driver-app changes and separate mobile API edits were intentionally left out of the push so this web deploy stayed isolated and safer for trips, imports, and dispatch persistence.'
}, {
  area: 'Checks completed',
  detail: 'Validated local runtime and build before upload: localhost root 200, /dispatcher 200, /api/nemt/dispatch 200 after fallback fix, and npm run build completed successfully.'
}, {
  area: 'Backup and safety',
  detail: 'Backup folder backup/SHEET-20260416-170133 exists as the local recovery point created before the manual-trip and dispatch-recovery changes continued.'
}, {
  area: 'Local shortcut icon',
  detail: 'The web app now exposes a manifest and app icon so localhost can be saved as a website shortcut with an icon. Use the browser menu on http://localhost:3000 to install or create the shortcut.'
}, {
  area: 'App message pipeline repair',
  detail: 'A missing normalizeDispatchMessageRecord import in nemt-dispatch-store caused /api/mobile/driver-messages POST to fail after saving the system message, so Web V2 did not receive the dispatch-thread update. The fix restores the thread write path used by Dispatcher messaging.'
}, {
  area: 'Scanner ZIP rule',
  detail: 'Scanner/import law: ZIP codes embedded inside address text are not trusted as trip ZIP values. The scanner strips those ZIP codes out of the address display, but only the dedicated ZIP columns remain valid for fromZipcode and toZipcode.'
}, {
  area: 'Render deploy record after scanner fix',
  detail: 'After validating local imports, a real Render deploy was pushed with the scanner ZIP rule, the dispatcher scroll-loop repair, the dispatch-thread message import fix, and the web manifest/icon block. During local verification the page first appeared blank because a stale dev .next output served 404 client assets, then Dispatcher showed a Maximum update depth error from the trip-table scroll effect. Both local blockers were repaired before the deploy push a4f1cab.'
}, {
  area: 'App receive visibility rule',
  detail: 'The next messaging law is permanent: driver-app incoming web messages must not be split into separate threads by dispatcher name. That name-based split is where this problem started: the driver could stop seeing what arrived under Carlos, and Carlos could stop seeing the driver reply in the same shared conversation. Incoming dispatcher-web messages now belong in one stable Dispatch thread so both sides see the same history.'
}, {
  area: 'App operations added after messaging repair',
  detail: 'The app now supports Time Off with 2-day notice, optional photo upload, a persistent submitted state, and an I\'M BACK reactivation action. It also restores patient phone call/text fallbacks, stronger GPS button backgrounds, and an English driver application form under login.'
}, {
  area: 'Day-off visibility law on web',
  detail: 'Drivers with active Time Off must remain visible in Dispatcher and Trip Dashboard. The safe rule is gray visibility plus appointment labeling in the existing driver selectors and route panels, not removal from the driver list and not any Excel/import mutation.'
}, {
  area: 'Fuel and Day Off shortcut placement',
  detail: 'If web-side shortcut buttons are added later, place them next to the existing selected-driver controls in Dispatcher and Trip Dashboard. Those actions are driver-scoped and should reuse the existing tablet flow instead of creating a disconnected panel.'
}];

const DIARIO_2026_04_20 = [{
  area: 'Wrong-day import repair',
  detail: 'The import date bug was traced to unsafe date parsing and local tomorrow generation. Import parsing now keeps local service dates stable so trips uploaded for tomorrow do not land under the wrong day.'
}, {
  area: 'Prune root cause and safety law',
  detail: 'The destructive loss came from applying shrink/prune logic to a partial date-window snapshot as if it were the full live dispatch state. The repair now scopes trip shrink to the active service-date window instead of globally deleting live trips from other days.'
}, {
  area: 'TEST aligned with production safety',
  detail: 'The critical date, sync, API, and SQL-store files in TEST were aligned with the safe production behavior so local verification now matches the real prune and date rules before future uploads.'
}, {
  area: 'Excel type and mobility visibility',
  detail: 'Trip Dashboard now shows the real imported Excel type label instead of collapsing everything into the normalized mobility shortcut only. Detection also expanded across imported fields so WCV, service-animal markers, wheelchair, electric wheelchair, and stretcher hints are recognized more reliably.'
}, {
  area: 'Trip modal cleanup',
  detail: 'Trip Update, Send Confirmation, and Cancel Trip modal labels no longer expose the huge internal import id built from rider, addresses, and raw times. The UI now shows a short readable trip identifier instead.'
}, {
  area: 'Excel compare time cleanup',
  detail: 'Excel Loader vs Current no longer shows raw Excel serial numbers like 46133.32013888889 in Pickup and Dropoff. Those snapshot values are now formatted into normal readable clock times before being shown in the comparison modal.'
}, {
  area: 'Render real deploy record',
  detail: 'The April 20 web repairs were uploaded to origin/main in multiple validated commits: 8c8940c for the local-date import fix, 4307383 for the real Excel type display and broader mobility detection, 0c2556f for readable trip modal ids, and 336a5d2 for Excel compare time formatting. Render real should auto-deploy those pushes from main.'
}, {
  area: 'Checks completed',
  detail: 'Repeated editor error checks returned clean for the touched files, and npm run build passed after the local fixes and again in the clean deploy worktree before each Render push.'
}, {
  area: 'Conversation record by day',
  detail: 'The full April 20 work log and conversation backup were written into conversation-summary-20260420.md and backup/chat-20260420-render-real-diary-and-dispatch-fixes.md so the day can be reviewed later without rebuilding context from memory.'
}];

const DIARIO_2026_04_23 = [{
  area: 'Excel Loader identity alignment',
  detail: 'The standalone Excel Loader was preserving a page-local preview row key as the trip id, while the Trip Dashboard import path kept the shared parser id. The loader now preserves the stable parser-generated id so both entry points use the same import identity before merge.'
}, {
  area: 'Duplicate-risk hypothesis narrowed',
  detail: 'Production SafeRide trips already carried real rideId values, and no generated RIDE-* fallback ids were found in the current live sample. That narrowed the immediate duplicate risk toward loader-path identity drift instead of a Twilio-side SMS persistence change.'
}, {
  area: 'Scoped-window visibility fix',
  detail: 'The standalone Excel Loader was not realigning the dispatch date window after importing or clearing the file days. That could make trips look deleted when the sync layer reloaded a different server scope. The loader now refreshes the visible window to the imported date range after those actions.'
}, {
  area: 'Latest import fingerprint refresh',
  detail: 'SafeRide merge now replaces the stored importFingerprint with the newest file fingerprint instead of preserving a stale older one. That keeps rereads of the same trips aligned with the latest imported match key and reduces false Removed Since Last Load flags.'
}, {
  area: 'Dashboard filter reset after import',
  detail: 'Trip Dashboard now resets the trip status filter back to All after a successful import or route-load import. That prevents the screen from staying stuck on Last Removed and making the imported result look artificially incomplete.'
}, {
  area: 'Dashboard hidden filter reset after import',
  detail: 'Trip Dashboard import now also clears lingering search, leg, type, service-animal, city, and ZIP filters after a successful import. That prevents the table from showing only a leftover subset like 75 visible trips when the dispatch memory already contains the full imported set.'
}, {
  area: 'Loader import persist-before-refresh fix',
  detail: 'The standalone SafeRide loader was refreshing dispatch from the server immediately after local import state changed, while persistence still waited in the deferred queue. The loader now waits for the dispatch persist flush before reloading the scoped server window, so a fresh server read does not snap back to the older partial trip count.'
}, {
  area: 'Validation and deploy path',
  detail: 'Local next build completed successfully after the loader identity fix. This deploy is intended for Render production through the main branch auto-deploy flow.'
}];

const HelpPage = () => {
  return <>
  <PageTitle title="Diarie" subName="Operations" />
      <Row className="g-3 mb-3">
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Modules indexed</p>
              <h4 className="mb-0">{HELP_ENTRIES.length}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Quick flow steps</p>
              <h4 className="mb-0">{QUICK_FLOW.length}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Core route</p>
              <h4 className="mb-0">Dispatcher</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Status</p>
              <h4 className="mb-0">Ready</h4>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card className="mb-3">
        <CardBody>
          <div className="d-flex flex-column flex-lg-row justify-content-between gap-3">
            <div>
              <h5 className="mb-1">Mapa completo de instrucciones</h5>
              <p className="text-muted mb-0">Indice alfabetico para ubicar cada modulo del sistema, que hace y donde abrirlo.</p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Link href="/dispatcher" className="btn btn-primary">Open Dispatcher</Link>
              <Link href="/system-messages" className="btn btn-outline-primary">Open System Messages</Link>
            </div>
          </div>
        </CardBody>
      </Card>

      <Row className="g-3 mb-3">
        <Col xl={5}>
          <Card className="h-100">
            <CardBody>
              <h5 className="mb-3">Flujo recomendado</h5>
              <div className="d-flex flex-column gap-2">
                {QUICK_FLOW.map(item => <div key={item.step} className="border rounded p-2">
                    <div className="fw-semibold">{item.step}</div>
                    <div className="small text-muted">{item.detail}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
        <Col xl={7}>
          <Card className="h-100">
            <CardBody>
              <h5 className="mb-3">Atajos rapidos</h5>
              <div className="d-flex flex-wrap gap-2">
                <Badge bg="primary">A/U/C = Assign, Unassign, Cancel</Badge>
                <Badge bg="secondary">AL/BL/CL = filtro de leg</Badge>
                <Badge bg="info">A/W/STR = tipo de movilidad</Badge>
                <Badge bg="dark">Route = construir secuencia</Badge>
                <Badge bg="warning" text="dark">Clear = limpiar seleccion</Badge>
                <Badge bg="success">Selected trips = conteo actual</Badge>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card className="mb-3">
        <CardBody>
          <div className="d-flex flex-column gap-2 mb-3">
            <h5 className="mb-0">System Engine Map</h5>
            <p className="text-muted mb-0">This is the behind-the-scenes operational flow. Use it when planning changes so a fix in one workspace does not silently break another workspace later.</p>
          </div>
          <div className="d-flex flex-column gap-2">
            {ENGINE_FLOW.map(item => <div key={item.stage} className="border rounded p-3">
                <div className="fw-semibold mb-1">{item.stage}</div>
                <div className="small text-muted">{item.detail}</div>
              </div>)}
          </div>
        </CardBody>
      </Card>

      <Row className="g-3 mb-3">
        <Col xl={6}>
          <Card className="h-100">
            <CardBody>
              <div className="d-flex flex-column gap-2 mb-3">
                <h5 className="mb-0">Manual Trip Entry — April 16, 2026</h5>
                <p className="text-muted mb-0">Shared notes for the new manual trip flow added to Dispatcher and Trip Dashboard.</p>
              </div>
              <div className="d-flex flex-column gap-2">
                {MANUAL_TRIP_ENTRY_2026_04_16.map(item => <div key={item.area} className="border rounded p-3">
                    <div className="fw-semibold mb-1">{item.area}</div>
                    <div className="small text-muted">{item.detail}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
        <Col xl={6}>
          <Card className="h-100">
            <CardBody>
              <div className="d-flex flex-column gap-2 mb-3">
                <h5 className="mb-0">Safe Deploy Note</h5>
                <p className="text-muted mb-0">Use this before any manual web deploy when trip safety matters more than speed.</p>
              </div>
              <div className="d-flex flex-column gap-2">
                {SAFE_DEPLOY_NOTE.map(item => <div key={item.step} className="border rounded p-3">
                    <div className="fw-semibold mb-1">{item.step}</div>
                    <div className="small text-muted">{item.detail}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col xl={12}>
          <Card className="h-100 border-success-subtle">
            <CardBody>
              <div className="d-flex flex-column gap-2 mb-3">
                <h5 className="mb-0">Diario — April 23, 2026</h5>
                <p className="text-muted mb-0">Operational diary for the Excel Loader identity alignment and the Render deploy prepared today.</p>
              </div>
              <div className="d-flex flex-column gap-2">
                {DIARIO_2026_04_23.map(item => <div key={item.area} className="border rounded p-3">
                    <div className="fw-semibold mb-1">{item.area}</div>
                    <div className="small text-muted">{item.detail}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col xl={12}>
          <Card className="h-100 border-success-subtle">
            <CardBody>
              <div className="d-flex flex-column gap-2 mb-3">
                <h5 className="mb-0">Diario — April 20, 2026</h5>
                <p className="text-muted mb-0">Operational diary for the full day of dispatch fixes, root-cause notes, validation, and Render production uploads completed on April 20.</p>
              </div>
              <div className="d-flex flex-column gap-2">
                {DIARIO_2026_04_20.map(item => <div key={item.area} className="border rounded p-3">
                    <div className="fw-semibold mb-1">{item.area}</div>
                    <div className="small text-muted">{item.detail}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col xl={12}>
          <Card className="h-100 border-success-subtle">
            <CardBody>
              <div className="d-flex flex-column gap-2 mb-3">
                <h5 className="mb-0">Diario — April 16, 2026</h5>
                <p className="text-muted mb-0">Operational diary for major fixes. This entry records the SQL-related repair, trip-protection guards, deploy scope, and validation from today.</p>
              </div>
              <div className="d-flex flex-column gap-2">
                {DIARIO_2026_04_16.map(item => <div key={item.area} className="border rounded p-3">
                    <div className="fw-semibold mb-1">{item.area}</div>
                    <div className="small text-muted">{item.detail}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col xl={6}>
          <Card className="h-100">
            <CardBody>
              <h5 className="mb-3">Shared Tree Dependencies</h5>
              <div className="d-flex flex-column gap-2">
                {SHARED_TREE_MAP.map(item => <div key={item.area} className="border rounded p-2">
                    <div className="fw-semibold">{item.area}</div>
                    <div className="small text-muted">{item.role}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
        <Col xl={6}>
          <Card className="h-100">
            <CardBody>
              <h5 className="mb-3">Change Safety Rules</h5>
              <div className="d-flex flex-column gap-2">
                {CHANGE_SAFETY_RULES.map(item => <div key={item.rule} className="border rounded p-2">
                    <div className="fw-semibold">{item.rule}</div>
                    <div className="small text-muted">{item.detail}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card className="mb-3">
        <CardBody>
          <div className="d-flex flex-column gap-2 mb-3">
            <h5 className="mb-0">UI Change Guardrails</h5>
            <p className="text-muted mb-0">Use this before adding any button, shortcut, panel or workflow action. The goal is to keep controls inside the correct operational flow and to state the consequences before new UI is created.</p>
          </div>
          <div className="d-flex flex-column gap-2">
            {UI_CHANGE_GUARDRAILS.map(item => <div key={item.step} className="border rounded p-3">
                <div className="fw-semibold mb-1">{item.step}</div>
                <div className="small text-muted">{item.detail}</div>
              </div>)}
          </div>
        </CardBody>
      </Card>

      <Card className="mb-3">
        <CardBody>
          <div className="d-flex flex-column gap-2 mb-3">
            <h5 className="mb-0">Full Change Protocol</h5>
            <p className="text-muted mb-0">This is the written procedure for future requests. Follow it in order before creating buttons, panels, shortcuts, filters, loaders, or workflow changes.</p>
          </div>
          <div className="d-flex flex-column gap-2">
            {CHANGE_REQUEST_PROTOCOL.map(item => <div key={item.part} className="border rounded p-3">
                <div className="fw-semibold mb-1">{item.part}</div>
                <div className="small text-muted">{item.detail}</div>
              </div>)}
          </div>
        </CardBody>
      </Card>

      <Row className="g-3 mb-3">
        <Col xl={6}>
          <Card className="h-100">
            <CardBody>
              <h5 className="mb-3">Button Placement Rules</h5>
              <div className="d-flex flex-column gap-2">
                {BUTTON_PLACEMENT_RULES.map(item => <div key={item.rule} className="border rounded p-3">
                    <div className="fw-semibold mb-1">{item.rule}</div>
                    <div className="small text-muted">Consequence: {item.consequence}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
        <Col xl={6}>
          <Card className="h-100">
            <CardBody>
              <h5 className="mb-3">Consequence Scan Checklist</h5>
              <div className="d-flex flex-column gap-2">
                {CONSEQUENCE_SCAN_CHECKLIST.map(item => <div key={item.area} className="border rounded p-3">
                    <div className="fw-semibold mb-1">{item.area}</div>
                    <div className="small text-muted">{item.check}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card className="mb-3">
        <CardBody>
          <div className="d-flex flex-column gap-2 mb-3">
            <h5 className="mb-0">Deploy Discipline</h5>
            <p className="text-muted mb-0">This is the required order for safe delivery. The system works best when changes are scanned, explained, validated, and only then deployed.</p>
          </div>
          <div className="d-flex flex-column gap-2">
            {DEPLOY_DISCIPLINE.map(item => <div key={item.step} className="border rounded p-3">
                <div className="fw-semibold mb-1">{item.step}</div>
                <div className="small text-muted">{item.detail}</div>
              </div>)}
          </div>
        </CardBody>
      </Card>

      <Row className="g-3 mb-3">
        <Col xl={6}>
          <Card className="h-100">
            <CardBody>
              <div className="d-flex flex-column gap-2 mb-3">
                <h5 className="mb-0">Web Recovery Notes — April 16, 2026</h5>
                <p className="text-muted mb-0">Web-only summary of the dispatch recovery work completed today. This section excludes app/mobile-only changes on purpose.</p>
              </div>
              <div className="d-flex flex-column gap-2">
                {WEB_RECOVERY_2026_04_16.map(item => <div key={item.area} className="border rounded p-3">
                    <div className="fw-semibold mb-1">{item.area}</div>
                    <div className="small text-muted">{item.detail}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
        <Col xl={6} />
      </Row>

      <Card className="mb-3">
        <CardBody>
          <h5 className="mb-3">Changelog — Version History</h5>
          <div className="d-flex flex-column gap-3">

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V23</Badge>
                <span className="fw-semibold text-dark">Excel Loader Identity Alignment</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 23, 2026 — Latest</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>The standalone Excel Loader now preserves the stable parser-generated trip id instead of replacing it with a page-local preview row key.</li>
                <li>This keeps the standalone loader aligned with the embedded Trip Dashboard import path so both loaders enter the merge flow with the same trip identity anchor.</li>
                <li>The standalone loader now also refreshes the dispatch date window to the imported file range after import or day-clear actions so trips do not appear to vanish when the sync layer reloads a different server scope.</li>
                <li>SafeRide merge now refreshes the stored import fingerprint from the newest imported row so rereading the same file does not leave stale matching keys behind.</li>
                <li>Trip Dashboard now resets the status filter back to All after import so the screen does not remain stuck on Last Removed and hide the rest of the imported trips.</li>
                <li>Trip Dashboard import now also clears lingering search, leg, type, service-animal, city, and ZIP filters so the imported result is not reduced to an old filtered subset.</li>
                <li>The standalone loader now waits for dispatch persistence to finish before it refreshes the server window, preventing the import screen from snapping back to an older partial count such as 14 trips.</li>
                <li>Local next build completed successfully before the Render deploy push.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V22</Badge>
                <span className="fw-semibold text-dark">Dispatch Date Safety + Excel Visibility + Diary Record</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 20, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Fixed the wrong-day SafeRide import behavior by keeping local service-date parsing stable and aligning tomorrow generation with the operational timezone rules.</li>
                <li>Documented and repaired the destructive prune regression so partial date-window snapshots no longer delete live trips from other service dates.</li>
                <li>Trip Dashboard now shows real imported Excel type labels and broader mobility/support detection from imported fields, including WCV and service-animal signals.</li>
                <li>Trip Update and related modals now show readable trip ids instead of the long internal import id string.</li>
                <li>Excel Loader vs Current now formats raw Excel pickup and dropoff serials into readable times before display.</li>
                <li>Stored the April 20 conversation history in dated diary markdown files so the day can be recovered later without losing context.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V21</Badge>
                <span className="fw-semibold text-dark">Trip Dashboard Scanner + Column Defaults Deploy</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 20, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>System Trip Scanner toolbar now includes a direct Confirmation button so visible selected trips can open the existing confirmation flow from the scanner panel.</li>
                <li>The trip table Notes header now shows the Notes label again instead of only the icon, fixing the missing first letter in the dashboard header row.</li>
                <li>Trip Dashboard column setup now treats all trip columns as the default setup, matching the dispatcher preference for a full table view.</li>
                <li>The column picker now shows a real All Columns checkmark when every trip column is active, so the setup panel matches the saved visible state.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V20</Badge>
                <span className="fw-semibold text-dark">Diarie Rename + Trip Dashboard Cleanup + Day Off Web Review</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 17, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Trip Dashboard no longer shows the extra left-side Help shortcut; the remaining visible shortcut now reads Diarie and still routes to /help.</li>
                <li>The /help page title and browser label now show Diarie so the operating diary matches the user-facing name without changing the route.</li>
                <li>Dispatcher now includes a real web review path for active Day Off requests so dispatch can open the driver, deny the request, or cancel it from web and clear the matching active alert.</li>
                <li>The APK local polish in this same deploy removes the veh-1 label under the driver name, hides the already-submitted Time Off proof photo unless the driver selects a replacement, and restores the return-action styles so the Android bundle exports cleanly again.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V19</Badge>
                <span className="fw-semibold text-dark">Driver Workflow + Applications + Dispatcher Push</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 17, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Pushed commit c15ff7e to origin/main so Render can deploy the full April 17 driver workflow, dispatcher, and applications update instead of the older day-off-only commit.</li>
                <li>Dispatcher now includes the latest operational controls from this session, including Late Trips review, Reinstate actions, safer selection clearing, and direct Applications access.</li>
                <li>The web Applications page now reads real app submissions, and the mobile application intake now sends the larger English employment form into system messages.</li>
                <li>Driver trip flow was aligned across APK and backend so in-progress detection, WillCall activation, cancellation evidence, and post-completion queue behavior stay consistent.</li>
                <li>Started a fresh EAS Android preview build from the updated source so the APK side can be tested with the same code that was just pushed.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V18</Badge>
                <span className="fw-semibold text-dark">App Time Off Visibility + Driver Appointment Safety</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 17, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Time Off in the app now enforces 2-day notice, no longer requires a photo, stays visibly submitted, and lets the driver reactivate with an I\'M BACK action.</li>
                <li>Dispatcher and Trip Dashboard now keep day-off drivers visible in the normal driver flows instead of making them look missing from operations.</li>
                <li>The safe visibility rule is gray + appointment label inside the existing driver selectors, driver panel, and route header.</li>
                <li>Safe future placement for Fuel and Day Off shortcuts is next to selected-driver controls in Dispatcher and Trip Dashboard, not in Excel Loader or a new disconnected module.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V17</Badge>
                <span className="fw-semibold text-dark">App Receive Visibility — Single Dispatch Thread</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 16, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Documented the real visibility problem in driver-app messaging: incoming web messages were being split into separate threads by dispatcher name instead of one stable Dispatch conversation.</li>
                <li>That split is what started the problem: the driver did not always see what arrived under Carlos, and Carlos did not always see the driver reply in the same thread.</li>
                <li>The rule is now explicit: incoming dispatcher-web messages must be grouped under Dispatch, not under each sender name.</li>
                <li>This keeps the app inbox aligned with the operational expectation that driver-to-dispatch messaging is one shared conversation, not many hidden name-based threads.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V16</Badge>
                <span className="fw-semibold text-dark">Render Deploy — Scanner Fix + Dispatcher Stability</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 16, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Pushed real deploy commit a4f1cab to origin/main after validating the scanner ZIP rule locally.</li>
                <li>Confirmed the imported trips no longer showed ZIP duplicated inside the address text after the scanner/import cleanup.</li>
                <li>Local verification hit two separate blockers before deploy: stale .next client assets returning 404 and a Dispatcher Maximum update depth loop in the trip-table scroll effect.</li>
                <li>Fixed the Dispatcher loop by preventing redundant scroll-state updates and removing the self-triggering ResizeObserver on the scroll container.</li>
                <li>Kept unrelated driver-app changes out of the deploy so Render only received the web fixes that were validated.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V15</Badge>
                <span className="fw-semibold text-dark">Scanner ZIP Law — Ignore ZIP Inside Address</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 16, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Made the scanner rule permanent: ZIP codes found inside address text are no longer treated as trusted trip ZIP data.</li>
                <li>The import flow now strips embedded ZIP codes from address text to avoid duplicate ZIP display in the trip table.</li>
                <li>Only explicit ZIP columns from the file remain valid for fromZipcode and toZipcode.</li>
                <li>This prevents address-plus-ZIP duplication from polluting scanner results, imports, and later trip rendering.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V14</Badge>
                <span className="fw-semibold text-dark">App Messages To Web V2 — Dispatch Thread Fix</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 16, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Found the real break in the app-to-web message path: /api/mobile/driver-messages POST was returning 500 after the system message save.</li>
                <li>Root cause was a missing normalizeDispatchMessageRecord import in nemt-dispatch-store during dispatch-thread persistence.</li>
                <li>After the import fix, the local POST returned 200 and the message appeared in /api/nemt/dispatch/threads.</li>
                <li>This matters because Web V2 reads the driver thread update path, not just the raw system message row.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V13</Badge>
                <span className="fw-semibold text-dark">Local Shortcut Icon — Manifest Ready</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 16, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Added a web manifest so the local dispatch site can be saved as a website shortcut with app-style name and icon.</li>
                <li>Connected the existing FMG icon as the app, shortcut, and Apple touch icon in the root metadata.</li>
                <li>The shortcut opens to Dispatcher by default through the manifest start URL.</li>
                <li>Use the browser menu on localhost:3000 to create or install the shortcut during local testing.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V12</Badge>
                <span className="fw-semibold text-dark">Diario — SQL Repair + Trip Protection Memory</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 16, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Marked Help as the operating diary for major repairs, validations, and deploy notes.</li>
                <li>Recorded that production still uses SQL when DATABASE_URL exists and that the local fallback only runs outside production.</li>
                <li>Documented the local failure pattern that made trips appear lost when SQL was unavailable during development.</li>
                <li>Documented the guard that preserves manual trips during import replacement and per-date clearing flows.</li>
                <li>Kept the deploy scope written down so future edits do not mix unrelated app/mobile changes with web trip safety work.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V11</Badge>
                <span className="fw-semibold text-dark">Deploy Record — Manual Trip Flow Uploaded With Safe Scope</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 16, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Pushed commit df6ef61 to origin/main after isolating only the intended web/manual-trip files.</li>
                <li>Render web service is configured to auto deploy on commit, so the push is the deploy trigger.</li>
                <li>Kept the local fallback in nemt-dispatch-store because it only activates outside production when DATABASE_URL is missing.</li>
                <li>Confirmed local checks before upload: localhost root 200, /dispatcher 200, /api/nemt/dispatch 200, and npm run build passed.</li>
                <li>Left unrelated driver-app and separate mobile API edits out of the push to reduce operational risk.</li>
                <li>Stored this note in Help so future changes can see exactly what was deployed and why.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V10</Badge>
                <span className="fw-semibold text-dark">Manual Trip Entry — Shared Modal + Protected Manual Records</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 16, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Created a local recovery backup before continuing: backup/SHEET-20260416-170133.</li>
                <li>Added a shared manual-trip modal that opens from Trip Dashboard and Dispatcher.</li>
                <li>Added a new +Trip button in the main action toolbar of both workspaces.</li>
                <li>Both screens now create manual trips through one central shared-context mutation instead of separate local code paths.</li>
                <li>Manual trips are marked with protection flags so normal import replacement and per-date clearing flows do not wipe them out.</li>
                <li>The New Trip action was placed in the main toolbar action area on both workspaces so operators can find it in the same place later.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V9</Badge>
                <span className="fw-semibold text-dark">Dispatch Recovery — Date Scope, Route Preservation, Shared Sync</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 16, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Restored correct trip visibility for operational dates in Dispatcher and Trip Dashboard.</li>
                <li>Preserved routes across trip reimports so valid route work would not disappear during intake updates.</li>
                <li>Added route-count fallback from visible trips when route-plan-only counts were insufficient.</li>
                <li>Scoped dispatch loading to the active operational window and reduced refresh-loop damage.</li>
                <li>Improved shared dispatch state and driver-thread sync so connected screens remain aligned more reliably.</li>
                <li>Expanded Help guidance to document engine flow, change protocol, and deploy discipline before future edits.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="warning" text="dark" className="fs-6 px-3 py-2">V8</Badge>
                <span className="fw-semibold text-dark">Dispatcher &amp; Trip Dashboard — Workflow Separation + Custom Toolbar Builder</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 1, 2026</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Fixed local-vs-server sync race: local dispatch mutations (delete route, unassign, etc.) now persist correctly without being reverted by stale server snapshots.</li>
                <li>Trip Dashboard and Dispatcher selections are now workspace-local (selected trips/driver/route no longer leak from one screen to the other).</li>
                <li>Default date behavior split by workspace: Trip Dashboard opens with no selected date, Dispatcher opens on current day.</li>
                <li>Trip Dashboard with no date selected now shows no trips/routes (prevents old-day records from appearing unexpectedly).</li>
                <li>Columns picker popover repositioned to avoid clipping off-screen on the right.</li>
                <li>Trip Dashboard header cleanup: removed extra trip/driver/live badges, changed label VDRS → Drivers, added driver search input in drivers panel.</li>
                <li>Selected-count indicator moved from top bar into table header (shows numeric value only).</li>
                <li>Color action groups (A/A2/U/C, Leg, Type) moved to top toolbar row per operator request.</li>
                <li>New toolbar customization mode in Trip Dashboard and Dispatcher: Edit, drag blocks, Save, and Reset.</li>
                <li>Toolbar customization now works across rows (move blocks between row 1/2/3) via drag-and-drop, and removed temporary 1/2/3 move buttons.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="primary" className="fs-6 px-3 py-2">V7</Badge>
                <span className="fw-semibold text-dark">Trip Dashboard — Flexible Docking Layouts</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 31, 2026 — Evening</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>3 layout modes: <strong>Normal</strong>, <strong>Focus Right</strong> (map-focused right column), <strong>Stacked</strong> (panels stacked vertically)</li>
                <li>Focus Right keeps the map emphasized inside the workspace without opening a separate window</li>
                <li>Panel visibility controls: Both / VDRS / Routes / Hide bottom panels</li>
                <li>Swap button to reverse VDRS ↔ Routes panel order</li>
                <li>Restore button — one click returns to Normal layout</li>
                <li>Layout preference, panel view, and panel order all saved to localStorage and restored on next visit</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V6</Badge>
                <span className="fw-semibold text-dark">Scrollbar &amp; WillCall Polish</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 31, 2026 — PM</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Top horizontal scrollbar now visible in Dispatcher <strong>and</strong> Trip Dashboard (forced +40px overflow so Chrome always shows scroll thumb)</li>
                <li>ScrollWidth measured via ResizeObserver on actual table element — no more stale width</li>
                <li>WillCall (WC) button now only appears on non-AL (non-outbound) trip legs in Dispatcher</li>
                <li>Improved <code>getTripLegFilterKey</code> — reads <code>trip.leg / tripLeg / legCode</code> (A/B/C/D) before falling back to legLabel text parsing</li>
                <li>Confirmation "Detected max miles" badge off by default — toggle checkbox to enable</li>
                <li>Pickup times in Confirmation now show readable AM/PM instead of Excel serial numbers</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="primary" className="fs-6 px-3 py-2">V5</Badge>
                <span className="fw-semibold text-dark">Dispatcher &amp; Dashboard UI Polish</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 31, 2026 — Mid Morning</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Synced dual top/bottom horizontal scrollbar added to Dispatcher and Trip Dashboard</li>
                <li>Draggable grey column resizers on dispatch tables</li>
                <li>Long address columns clamped to two lines to save vertical space</li>
                <li>PU/DO ZIP columns added to dispatch table</li>
                <li>Rider name stacking improved; table forced to <code>max-content</code> width for horizontal scroll</li>
                <li>Miles range selectors fixed — avoids hidden min=0 and preserves correct bounds</li>
                <li>Confirmation time window supports spreadsheet numeric pickup times</li>
                <li>Confirmation selection synced with visible filtered trips</li>
                <li>Auto-detect max miles (cap 25) and deduplication in Confirmation</li>
                <li>Patient exclusion rules: one-day / range / always</li>
                <li>Leg scope controls (A/B) for confirmation and cancellation</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="info" className="fs-6 px-3 py-2">V4</Badge>
                <span className="fw-semibold text-dark">Confirmation Workspace — Full Feature Build</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 31, 2026 — Morning</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Date/time filtering, manual confirmation, cancel with note, and PDF export</li>
                <li>Hospital/Rehab status — exclude trips until expiration date</li>
                <li>SMS/WhatsApp confirmation method selection with batch sending</li>
                <li>WillCall status: red badge, toggle button, driver WhatsApp notification</li>
                <li>Trip update workflow: call / SMS / WhatsApp, schedule NEW marker, rider notes</li>
                <li>Patient history with date range search and confirmation analytics</li>
                <li>Mileage filter with auto-detected default (2AM–8AM window, max 25 mi)</li>
                <li>Theme toggle moved from Dispatcher toolbar to Settings only</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="warning" text="dark" className="fs-6 px-3 py-2">V3</Badge>
                <span className="fw-semibold text-dark">Communications + Translations</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 31, 2026 — Early Morning</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Communication extensions: WhatsApp, Telegram, Viber, Signal, SMS — server API route + modal UI</li>
                <li>Auto-link driver phone numbers to WhatsApp with quick message buttons</li>
                <li>Additional driver document fields: 1099, 3× Training Certificates</li>
                <li>Full UI translated from Spanish to English; AI bot context updated</li>
                <li>License check shows days remaining per driver with expiration alert wording</li>
                <li>Local file proxy for driver documents</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="danger" className="fs-6 px-3 py-2">V2</Badge>
                <span className="fw-semibold text-dark">Security Advanced + 2FA</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 30, 2026 — Evening / Night</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>2FA (TOTP) for admin users with login verification flow</li>
                <li>Login lockout UX — blocks account after repeated failures</li>
                <li>Email-based passwordless login with verification codes</li>
                <li>Configurable inactivity timeout + auto-logout on web sessions</li>
                <li>Login failure logging system with admin API endpoint</li>
                <li>IP binding and 15-minute session hardening</li>
                <li>Lock entire dispatch panel when locked — overlay disables all controls</li>
                <li>Toolbar reorganized into 3 rows; A/U/C buttons moved to bottom panel</li>
                <li>ZIP/City filters, Column picker fix, draggable grey divider for column resize</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="secondary" className="fs-6 px-3 py-2">V1</Badge>
                <span className="fw-semibold text-dark">Security Foundation + Auth Hardening</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 30, 2026 — Afternoon</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Require authentication on all routes; admin role required for write APIs</li>
                <li>Strengthen login validation — prevent empty credential bypass</li>
                <li>Remove "Remember me" checkbox from login</li>
                <li>Stabilize dispatch assistant mic/transcript controls</li>
                <li>Updated company logo asset + sidebar logo toggle placement</li>
                <li>User admin delete rules and improved local dispatch assistant</li>
              </ul>
            </div>

          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h5 className="mb-3">Indice alfabetico A-Z</h5>
          <div className="table-responsive">
            <Table className="table-centered align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Module</th>
                  <th>Instruction</th>
                  <th>Route</th>
                </tr>
              </thead>
              <tbody>
                {HELP_ENTRIES.map(entry => <tr key={entry.module}>
                    <td className="fw-semibold">{entry.module}</td>
                    <td>{entry.instruction}</td>
                    <td>
                      <Link href={entry.route} className="btn btn-outline-secondary btn-sm">{entry.route}</Link>
                    </td>
                  </tr>)}
              </tbody>
            </Table>
          </div>
        </CardBody>
      </Card>
    </>;
};

export default HelpPage;
