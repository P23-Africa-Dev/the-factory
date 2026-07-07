Privacy Policy for Factory 23

<mark>**REVIEW LEGEND:** ~~strikethrough~~ = statement contradicted by the actual codebase. `<mark>` highlighted notes = the correction or a gap (something the product does that this document never discloses). See `docs/privacy-policy-updated.md` for the corrected version of this document.</mark>
Executive Summary: This Privacy Policy explains how P23 Africa (trading as Factory 23) collects, uses, discloses, and protects personal data in connection with its field workforce management platform (the “Service”) used across Africa (launching first in Nigeria). It covers all data relating to users (company administrators and field workers), and their customers/business contacts. Key highlights include:
Data Collected: We collect user-provided account information (name, email, phone, job title, company), employee data (attendance, check-in/out times, GPS location only while on duty, task and visit records, photos, signatures), and customer/business records (customer names, contacts, addresses, GPS coordinates, visit history), plus optional uploaded media.
How We Use Data: Personal and employee data are used to provide the Service (tracking, attendance, task management, reporting), to generate AI-based field reports and analytics, and to communicate with users. We also use some data to power automated outreach and to improve and secure the Service.
Legal Basis: Processing is based on the customer’s contract with us (providing the platform) and the user’s consent or legitimate interest (e.g. managing field operations). Where applicable, we follow the Nigeria Data Protection Act 2023 (NDPA) and GDPR principles.
Data Sharing: We do not sell personal data. We share data with subprocessors strictly to operate the Service. For example, we host data on DigitalOcean (which is SOC-2 certified), use Mapbox for mapping (Mapbox adheres to EU/UK Data Privacy Frameworks), use ~~OpenAI/Google (“Gemini”, Anthropic’s “Grok”)~~ <mark>**[ERROR: actual providers are OpenAI and Anthropic Claude. Gemini is not integrated anywhere in the codebase, and "Anthropic's Grok" is not a real product — Grok is made by xAI, not Anthropic.]**</mark> for AI reports, and Stripe/Flutterwave for payments. All subprocessors are contractually bound to protect data and only use it to provide the contracted services.
Location Tracking: GPS location is collected only while a field worker is “checked in” on a job. When the worker checks out or ends the shift, location tracking stops. Location is used solely to verify visit accuracy and estimate routes.
AI Processing: We employ third-party AI (OpenAI, Gemini, Grok) to generate field reports and analytics. No voice recordings (from voice notes) are stored; any voice input is transcribed for the report and then discarded. AI processing uses the relevant customer data (e.g. sales visit notes) to generate outputs, which are stored in your account. AI features cannot be switched off (they are integral to reporting), but they operate under the same data protections as the rest of the Service.
Analytics & Cookies: We use Google Analytics on our website to understand usage patterns (with cookies and IP/anonymized data). We do not use any tracking beyond basic analytics for site improvement.
Data Retention: Data is retained for as long as your account is active, plus 30 days after account deletion (backups 90 days). This aligns with our policy to allow recovery from accidental deletion. We then permanently delete personal data.
User Rights: In compliance with the NDPA 2023 (Part VI) and good international practice, data subjects have rights to access, correct, delete, restrict, port, and object to processing of their data. Users can request a copy of their data, correct errors, or erase their account at any time by contacting us.
Children’s Data: The Service is not intended for children under 18. We do not knowingly collect data from minors.
Cross-Border Transfers: User data is ~~primarily hosted in Nigeria on DigitalOcean servers (Lagos/Abuja)~~ <mark>**[ERROR: the production storage config points to DigitalOcean's London ("lon1") region (`factory23-storage.lon1.digitaloceanspaces.com`), not Lagos/Abuja. The registered company address is also London. This "Nigeria-only" claim does not match the actual infrastructure.]**</mark>. If we ever transfer data outside Nigeria (e.g. for support or AI processing), we will ensure an adequate level of protection via contractual safeguards or reliance on recognized frameworks
Security: We implement strong technical and organizational measures – including encryption in transit (HTTPS/TLS) and at rest, role-based access controls, audit logs, and regular security audits. DigitalOcean’s infrastructure is SOC-2 and ISO certified.
Governing Law: This policy and any disputes are governed by Nigerian law (Data Protection Act 2023 and contract law), reflecting our primary launch jurisdiction.
Below is the detailed Privacy Policy. It is intended to meet Nigerian NDPA requirements (providing clear, concise notice of data practices) and global best practice (similar to GDPR compliance).

Introduction
This Privacy Policy explains how P23 Africa (the “Company”, “we”, “us”, or “Factory 23”) collects, uses, discloses, and protects personal data in connection with our platform Factory 23 (the “Service”). Factory 23 is a field workforce management system used by companies to track their mobile employees, verify visits, and automate reporting.
Legal Entity: P23 Africa, trading as Factory 23.
Registered Address: 185 Tower Bridge Rd, London SE1 2UF, UK.
Contact: hello@p23africa.com (for privacy inquiries).
Website: http://thefactory23.com/ (“Site”).
Operating Region: Africa (initial launch in Nigeria; we may expand to other African countries).
We are the data controller for the personal data processed by the Service. When we integrate third-party services (e.g. payment, mapping, AI), those providers act as subprocessors under our instructions.
All users of Factory 23 (company administrators, managers, field employees, etc.) must abide by this Privacy Policy. If you are an individual whose data is processed via the Service (e.g. a field employee or a customer contact of a Factory 23 client), this Policy also covers your rights and our practices.
Key Definitions
“Personal Data” (NDPA): Any information relating to an identified or identifiable individual. Under this Policy, it includes all categories listed below.
“Sensitive Data”: As defined by NDPA (health, financial, etc.). We do not intentionally collect special categories like health data via Factory 23.
“Processing”: Any operation on personal data (collection, storage, use, transfer, etc.).
“Data Subject”: An individual whose personal data is processed by us (e.g. a factory23 user or employee).
Information We Collect
We collect the following categories of personal data. This includes data you provide us and data automatically collected when using the Service.
User Account Information
When a person registers for or administers an account, we collect:
Contact and identity data: Name, email address, phone number, job title, company name.
Authentication data: Username, password (securely hashed), and other account settings.
Other profile data: Any additional optional profile info (e.g. profile photo).
This data is typically provided by the company administrator or user themselves during signup.
Employee and Workforce Data
For each employee (field worker, salesperson, technician) using the Service, we collect:
Attendance/Check-in data: Timestamps of check-in/check-out or clock-in/out.
GPS location data: Geolocation while the user is “checked in” for a job or shift. We do not continuously track when the user is off duty. GPS operates in the background only during an active check-in (a user can manually check out to stop tracking).
Task and visit data: Records of assigned tasks, scheduled visits, routes, and completed visits (including visit timestamps and durations).
Photographic and signature data: Photos or documents captured by the user (or customer signatures) as part of verifying a visit or task.
Field report data: Notes or forms completed in the field app (text, dropdowns, etc.).
Work history: A log of completed tasks and generated reports for performance tracking.
These data are collected during normal use of Factory 23 (e.g. when a field agent checks in, marks a visit, takes a photo of a delivery or signature, or closes a task). We do not collect data unrelated to job functions.
Customer/Business Contact Data
Factory 23 allows companies to maintain records of their customers or business partners. This may include:
Customer identifiers: Business or customer name, contact person.
Contact details: Email addresses, phone numbers, mailing or site addresses, and optional GPS coordinates of client locations.
Visit history: Records of when and where visits to these customers occurred (from the employee location data above).
This information is typically entered by the company’s administrators for the purpose of scheduling and reporting sales visits.
Media and Files
Photos, Videos, Documents: Employees may capture customer premises, equipment, or paperwork. These are stored as part of the visit record.
Signatures: Digital signatures captured via touch/input to confirm delivery or service.
We store such media in the system to serve their intended purposes (proof of service, record-keeping). We do not use or analyze image content beyond these operational needs.
Analytics and Usage Data
Usage logs: When users interact with the Service (logins, clicks, API calls), we log timestamps, IP addresses, device/browser information, and pages accessed. This helps us maintain and improve the Service.
Cookies: Our website (http://thefactory23.com) uses cookies and Google Analytics to track visitor behaviour (page visits, durations, referrers). This is anonymised/non-personal data used for site analytics.
AI-Generated Data
Input for AI Reports: Notes or selections provided by employees can be fed to our AI reporting engine.
Generated Reports: The text and summaries produced by OpenAI/Gemini/Grok in response to those inputs.
We store the AI-generated outputs with the user’s data. The raw input content (e.g. voice note transcripts) is not separately stored beyond the report context.
How We Collect Data
Direct Input: Most data is entered by users or system admins in the app or web portal.
Device Sensors: The mobile app collects GPS coordinates via the device’s location services (with permission) only during active check-ins. The camera can be used from within the app (or images uploaded from gallery).
Automated Logs: We collect technical logs (IP, usage) automatically when the app or site is used.
Third-Party Services: Some data comes through integrations (e.g. payment confirmations from Stripe/Flutterwave, map data from Mapbox).
Imported or Third-Party Data: For features like automated outreach, companies may import contacts or leads, which we then process as described below.
We do not collect data from public sources or marketing partners for this service. All personal data processed is directly related to providing the field management Service.
How We Use Your Data
We use the collected data for the following purposes:
Provision of Services: To deliver Factory 23’s functionality (user accounts, task assignment, attendance tracking, visit verification, route mapping, payroll summary, commission tracking, etc.). For example, user identity data is used for authentication and account management; location data is used to map visits.
Field Operation Analytics and Reporting: To generate dashboards and summaries (e.g. daily attendance, visited locations, sales reports). AI algorithms process visit data to create written summaries and insights.
Automated Outreach: If enabled by the customer, to send communications (e.g. WhatsApp or email) to leads or customers using your account data (contacts, messages).
Service Improvement and Support: Aggregated/anonymous data may be analysed to improve features. We may also review specific data when assisting you (e.g. if troubleshooting a lost or incorrect location record).
Security and Fraud Prevention: To protect the Service and users, we analyse login patterns, detect anomalies, and prevent unauthorized access.
Legal Compliance: We may use and preserve information to comply with laws, respond to lawful requests, enforce our Terms of Service, and protect rights (e.g. in response to a subpoena or police request).
We will only use personal data for the purposes stated in this Policy or disclosed at collection. We do not use data for unrelated secondary purposes (e.g. marketing) without explicit consent.
Legal Basis for Processing
Under the NDPA and international norms, our processing of personal data relies on one or more lawful bases:
Contractual Necessity: Much of the data processing is necessary to perform our contract with the customer company (who provides Factory 23 to its employees). For example, tracking attendance or generating reports is part of the contracted service.
Consent: Where required by law (or requested by the customer), we may rely on user consent for certain processing, such as location tracking (consent is implied by logging into a job) or sending automated messages on your behalf.
Legitimate Interests: We have a legitimate interest in improving the Service and ensuring security. For example, we process usage logs and analytics data to enhance features, provided this does not override individuals’ privacy rights.
Legal Obligations: In rare cases, we may need to process or share data to comply with court orders, legal claims, or statutory requirements.
By using the Service, users acknowledge these bases. For example, by checking in on the app, a field employee effectively consents to location tracking during that check-in session.
GPS and Location Tracking
Scope: We collect precise location data from a field worker’s device only while the worker is actively checked in to a job or shift. GPS tracking is not continuous; when the user checks out (ends the task), location collection stops immediately. This ensures we minimize tracking to when it is necessary.
Purpose: Location data is used solely for verifying that field staff visited the correct sites, for mapping routes, and for attendance logs. It helps managers confirm on-site activities and optimize dispatching.
Consent & Control: Users must grant the app permission to access location data. They can disable tracking by closing the app or checking out. We remind users through the app that GPS is active only during check-ins.
Accuracy: We capture standard GPS coordinates (latitude/longitude). We do not collect altitude, precise sensor data, or continuously stream location outside of check-in periods.
Transparency: NDPA requires that we inform users about automated data collection. We do this via this Privacy Policy, in-app notices, and clear settings.
Storage: Location data points are stored in our database (DigitalOcean) as part of the attendance/visit record. They are encrypted at rest.
Photos, Signatures, and Documents
Field workers may capture photos (e.g. of delivered goods, site conditions) or customers’ signatures. These images/documents are:
Uploaded via the app or web portal.
Stored securely on our servers.
Associated with the relevant task/visit record.
We use these for operational purposes only. We do not scan images with AI or sell any image data. All media are deleted according to the data retention schedule (30 days after deletion of the associated record/account).
AI Processing and Reporting
Factory 23 uses third-party AI services (currently ~~OpenAI (GPT-4), Google Gemini, and Anthropic Grok~~ <mark>**[ERROR: no Gemini integration exists in the codebase. "Anthropic Grok" is not a real product. The actual providers are OpenAI and Anthropic Claude, selected via an internal provider router with automatic fallback.]**</mark>) to generate field activity reports and analytics from structured inputs and notes.

<mark>**[GAP: this section only describes AI-generated field reports, but the product also ships a general-purpose AI copilot ("ELY") that maintains persistent chat threads, can take actions on company data (tasks, CRM, scheduling), analyze uploaded files, transcribe meeting audio, and generate business forecasts. None of this broader scope is disclosed in this policy.]**</mark>
Input: Data like call notes, check-in details, or photo captions provided by users serve as prompts to the AI.
Processing: These AI models analyze the data and output summaries or insights (e.g. “John visited 5 customers today and achieved 80% of his sales target” or a written report of visits).
Storage: The AI-generated text is stored in the user’s account. This output is treated like any other user data. <mark>**[GAP: generated executive summary reports can carry a linked Google Drive file reference, implying reports may be exported/pushed to a customer's Google Drive. This data flow is not disclosed anywhere in this policy.]**</mark>
No Voice Storage: Although we allow voice notes to be entered, we do not store raw audio. ~~The app transcribes voice to text on-device (with user permission) and then discards the audio.~~ <mark>**[ERROR: transcription is not on-device. The recorded audio file is uploaded from the app to our backend, which forwards it to a third-party AI provider (OpenAI or Anthropic) for transcription. The audio does leave the device.]**</mark> Only the transcription is sent to AI for processing.
AI Data Use: We provide only the user’s data as prompt to the AI. OpenAI’s privacy policy states they do not use API data to train their models by default【27†L1-L9】. We do not share data beyond what is needed to get the AI output.
Automation Notice: These AI operations are considered automated processing (“automated decision-making”). In line with NDPA transparency requirements, we disclose that automated profiling/reporting occurs (without affecting user’s legal rights)【11†L740-L748】. Users cannot opt out of AI reports if they use that feature.
Analytics and Website Cookies
We use Google Analytics on our marketing website (thefactory23.com) and admin portal. This collects non-identifying usage data (pages viewed, session duration, browser type). We use cookies (and similar local storage) only for essential site functions and analytics. No personal data from Factory 23 users is shared with Google Analytics.
Our Cookie Notice (linked on the site) explains the cookies in use. As required by best practice, we ensure that any cookie that tracks personal data is only set with user consent.
Data Sharing and Disclosure
We do not sell or rent personal data. We only share data in the following ways:
Service Providers (Subprocessors): We use trusted vendors to run the Service. They include:
Hosting and Infrastructure: Data is stored on DigitalOcean (our cloud hosting). DigitalOcean is SOC 2 and ISO certified and compliant with the Global Privacy Recognition for Processors (PRP), ensuring they handle data securely.
Mapping Services: Mapbox provides map and geolocation functionality. Mapbox adheres to the EU-US and UK-US Data Privacy Frameworks. We provide Mapbox with GPS coordinates (anonymized user IDs) to render maps; Mapbox does not resell our data.
Payment Processors: If you pay via credit card, we send payment details to Stripe or Flutterwave. These providers collect your billing info under their own privacy policies. We never store card numbers on our servers. Only a transaction token/reference is stored to track payments.
Email and Messaging: To send system emails (e.g. notifications, password resets), we use a cloud email service (e.g. SendGrid) subject to data protection agreements. <mark>**[GAP: the product also sends notifications and CRM/lead correspondence via SMS and WhatsApp, and per-lead email threads through the CRM module. The SMS/WhatsApp provider and the CRM email-sending service are not named here as subprocessors.]**</mark>
Calendar Integration: <mark>**[GAP: not currently in this policy. The Service integrates with Google Calendar (OAuth) to sync meetings, attendee names/emails, and event details for users who connect it. Google should be listed here as a subprocessor for this data.]**</mark>
AI Providers: As above, we send certain data to AI services (~~OpenAI/Gemini/Grok~~ <mark>**[ERROR: should read "OpenAI/Anthropic Claude" — see correction above]**</mark>) for processing under strict confidentiality. They may temporarily log prompts/outputs for monitoring but have agreed not to retain our data beyond service provision.
In all cases, subprocessors are contractually obligated to use data only to provide the requested service and to protect it as we do.
Affiliated Companies: If P23 Africa is ever part of a merger or sale, customer data may be transferred to the new owner. We will notify users and preserve data protections in that event.
Legal Requirements: We may disclose personal data if required by law or to protect rights. For example, we may share information in response to a subpoena, court order, or government request, or to investigate fraud or security incidents. Such disclosure will be limited to what is necessary and lawful (NDPA Sections 40-46).
Data Shared Internally
P23 Africa employees and contractors access personal data only on a need-to-know basis. We train all staff on data protection. Internal access is logged and audited.
International Data Transfers
Factory 23 data is ~~generally stored in Nigeria (DigitalOcean’s Lagos/Abuja region)~~ <mark>**[ERROR: production file storage is configured against DigitalOcean's London ("lon1") region, not Lagos/Abuja. This statement should be corrected to reflect where data actually resides, and the cross-border-transfer justification below should be updated accordingly.]**</mark>. In some cases, data may be processed in other countries (for example, map or AI processing might occur on foreign servers). Under the NDPA, we will only transfer personal data outside Nigeria if adequate safeguards exist. For example:
Adequacy: If data goes to a country with similar data protection laws, or where the recipient company is certified (e.g. under an approved framework), we rely on that.
Contractual Safeguards: Otherwise, we use standard contractual clauses or binding corporate rules to ensure the recipient upholds NDPA-level protection.
Consent: For some cross-border uses, we may rely on user consent when necessary.
We document the basis for any cross-border transfer as required by law. If you are concerned about data leaving Nigeria, contact us for details.
13. Data Retention
We retain personal data only as long as necessary to provide the Service and meet legal or business obligations. Retention periods vary by data type:
Active Account Data: All data linked to an active Factory 23 account is retained for the duration of the subscription. This includes user profiles, attendance logs, reports, and media.
Deleted Accounts: When an account is deleted, we immediately deactivate it. Personal data is then retained for 30 days to allow for recovery from mistakes. After 30 days, we permanently delete the data from our live systems (backups are purged within 90 days).
Logs and Backups: System logs and backups are retained for up to 90 days for security and auditing. After 90 days (or upon secure disposal), old backups are overwritten.
Legal or Compliance Hold: If required by law (e.g. subpoena), or to protect our rights, we may retain specific data longer as needed (see “Legal Obligations” below).
All retention decisions comply with the NDPA’s requirement to specify retention periods. We document these policies internally and review them regularly.

<mark>**[GAP: no retention period is specified for AI copilot interaction logs. The backend stores full user prompts and AI responses (including business/personal content) per user/session with no purge job identified in the codebase. This data category and its retention period should be added to the Data Inventory table.]**</mark>
As a data subject, you may inquire about how long your data is stored or request earlier deletion, and we will respond according to law.
14. Data Security
We employ robust security measures:
Encryption: All data in transit is encrypted (HTTPS/TLS). Sensitive data (including location, attendance, and reports) is encrypted at rest in our databases.
Access Control: User access is protected by login credentials. Admin users (company managers) have role-based access only to their organization’s data. Factory 23 staff are granted access to production data only for maintenance or support, and all access is logged.
Audit Logs: We maintain audit logs of access and changes to critical data. Administrators can view logs of their own team’s activity (who accessed what).
Infrastructure Security: Our servers run on DigitalOcean, which meets high security standards (SOC 2 Type II, ISO 27001). Datacenters use physical and network security controls.
Software Security: We follow secure development practices, perform regular code reviews, and apply timely security patches. Penetration tests are conducted periodically.
Incident Response: We have procedures for detecting and responding to data breaches. If a breach affecting personal data occurs, we will notify affected parties and regulators as required by law. NDPA Section 40 mandates notification of breaches.
While no system is perfectly secure, we continuously monitor and improve our security posture to protect data confidentiality and integrity.
15. Data Subject Rights
Under the NDPA (Part VI) and similar privacy laws, individuals whose data we process have these rights:
Access / Copy: You can request a copy of the personal data we hold about you (user profile, attendance logs, etc.).
Correction: If your data is incomplete or inaccurate, you can request correction.
Erasure (“Right to be Forgotten”): You can request deletion of your personal data. We will delete (or anonymize) your data as described in the Retention section, unless we have a legal reason to keep it.
Data Portability: You can ask for your personal data in a common electronic format (e.g. CSV of your profile and logs) to move to another service.
Restriction or Objection: You can ask us to restrict processing of your data (e.g. stop using it for certain purposes) or to object to automated processing. Factory 23 processing is largely necessary for service delivery, so we may not always be able to refuse, but we will honor valid legal requests where possible.
Withdraw Consent: Where consent is the basis (e.g. marketing communications), you can withdraw consent at any time. This will not affect processing done prior to withdrawal.
Complaints: You have the right to lodge a complaint with the Nigeria Data Protection Commission (NDPC) or other relevant authority if you believe your data rights are violated.
To exercise these rights, contact us at hello@p23africa.com or through your account dashboard (where applicable). We will verify your identity and respond within the NDPA’s statutory timelines (typically 30 days). We may ask for additional proof of identity to prevent unauthorized disclosures.
16. Children’s Privacy
Factory 23 is not intended for children under 18. We do not knowingly collect or process personal data from minors. If we learn that a child’s data was submitted without parental consent, we will delete it.
17. Cookies and Similar Technologies
Our website uses cookies for functionality and analytics:
Essential Cookies: Required for site login, user preferences, etc.
Analytics Cookies: Used by Google Analytics to understand website use. You can opt out of analytics cookies via your browser.
We do not use cookies for advertising or tracking across sites. Our Cookie Notice (linked on the website) provides details.
18. Automated Outreach
If your company uses the Automated Outreach feature (email/SMS campaigns to leads), the Service will use the contact information you provide (names, email addresses, phone numbers) to send messages. This data is processed in accordance with this Privacy Policy. Recipients of outreach messages are users’ own contacts; we do not add third parties without your input. <mark>**[GAP: this section undersells the CRM module, which supports lead import/export, a full pipeline/kanban view, and per-lead email conversation threads — not just outbound campaigns. It also doesn't name the WhatsApp/SMS delivery provider used to send these messages.]**</mark>
19. Changes to this Policy
We may update this Privacy Policy from time to time (for example, to reflect new features, legal requirements, or improvements). We will post the revised policy on http://thefactory23.com/privacy and indicate the date of last update. Significant changes (e.g. new sharing or retention practices) will be communicated to existing customers (via email or dashboard notification) before taking effect. Continued use of Factory 23 after changes signifies acceptance of the updated Policy.
20. Contact Information
For privacy questions or to exercise your rights, please contact:
Privacy Officer: [Name/Title to be appointed]
Email: hello@p23africa.com (add “Privacy” in the subject)
Postal Address: 185 Tower Bridge Rd, London SE1 2UF, UK (for official correspondence)
You may also write to the Nigeria Data Protection Commission (NDPC) for any concerns.
21. Governing Law
This Privacy Policy and our processing of data are governed by the Nigeria Data Protection Act, 2023 and other applicable Nigerian laws. Any disputes will be resolved in Nigerian courts unless otherwise agreed by the parties.

Data Inventory Summary
Data Category
Personal Data?
Purpose of Processing
Legal Basis
Retention Period
Shared With
User Account Info (name, email, phone, job title, company)
Yes
Account setup, login, support
Contractual / Consent
Active account + 30 days
Internal (admins), DigitalOcean, Email service
Employee Profile (same as above)
Yes
Manage employee access, roles
Contractual / Legitimate Interest
Active account + 30 days
Internal, DigitalOcean
Attendance/Check-in Times
Yes
Attendance logs, payroll summaries
Contractual
Active account + 30 days
Internal, DigitalOcean
GPS Location (checked-in only)
Yes
Verify visits, map routes
Contractual / Consent
Active account + 30 days
Internal, DigitalOcean, Mapbox
Task/Visit Records
Yes
Report generation, performance tracking
Contractual
Active account + 30 days
Internal, DigitalOcean
Photos/Signatures
Yes
Proof of service, record-keeping
Contractual
Active account + 30 days
Internal, DigitalOcean
Customer Contacts & Business Records
Yes
Scheduling, visit history
Contractual
Active account + 30 days
Company, DigitalOcean
AI-generated Reports
Yes
Analytics, summaries
Contractual
Active account + 30 days
Internal, DigitalOcean
Usage Logs (IP, device)
Yes
Security, diagnostics
Legitimate Interest
90 days
Internal, DigitalOcean
Website Analytics (cookies)
anonymised
Site improvement
Legitimate Interest
26 months (max)
Google Analytics (aggregated)
Payment Tokens/Invoices
Yes
Billing
Contractual / Legal
7 years (financial records)
Stripe/Flutterwave
Email Communications
Yes
Notifications, support
Contractual / Consent
30 days
Internal, Email Provider

Note: All categories of personal data are encrypted at rest. Data shared with subprocessors is limited to what is necessary (e.g. Mapbox sees only geocoordinates for mapping) and governed by contractual agreements.
