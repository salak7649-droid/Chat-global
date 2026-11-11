import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ChatGlobalApp());
}

class ChatGlobalApp extends StatelessWidget {
  const ChatGlobalApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Chat Global',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6C35DE)),
          useMaterial3: true,
        ),
        home: const ChatHomePage(),
      );
}

class ChatHomePage extends StatefulWidget {
  const ChatHomePage({super.key});

  @override
  State<ChatHomePage> createState() => _ChatHomePageState();
}

class _ChatHomePageState extends State<ChatHomePage> {
  final _urlController = TextEditingController();
  WebViewController? _webController;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _restoreServer();
  }

  Future<void> _restoreServer() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('server_url') ?? const String.fromEnvironment('CHAT_SERVER_URL');
    if (saved.isNotEmpty) {
      _urlController.text = saved;
      await _openServer(saved);
    }
  }

  Future<void> _openServer(String rawUrl) async {
    final input = rawUrl.trim();
    final uri = Uri.tryParse(input);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty || !{'http', 'https'}.contains(uri.scheme)) {
      setState(() => _error = 'Masukkan alamat server yang valid, misalnya https://chat.example.com');
      return;
    }
    if (uri.scheme != 'https' && uri.host != 'localhost' && uri.host != '10.0.2.2') {
      setState(() => _error = 'Untuk penggunaan online, server harus memakai HTTPS agar login dan panggilan aman.');
      return;
    }

    setState(() { _loading = true; _error = null; });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('server_url', uri.toString().replaceFirst(RegExp(r'/+$'), ''));

    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) { if (mounted) setState(() => _loading = true); },
        onPageFinished: (_) { if (mounted) setState(() => _loading = false); },
        onWebResourceError: (error) {
          if (error.isForMainFrame == true && mounted) {
            setState(() { _loading = false; _error = 'Tidak dapat membuka server: ${error.description}'; });
          }
        },
      ));
    setState(() => _webController = controller);
    try {
      await controller.loadRequest(uri);
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = 'Gagal membuka server: $e'; });
    }
  }

  Future<void> _changeServer() async {
    await _webController?.clearCache();
    if (!mounted) return;
    setState(() { _webController = null; _error = null; });
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _webController;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chat Global'),
        actions: [
          if (controller != null)
            IconButton(
              tooltip: 'Muat ulang',
              onPressed: () => controller.reload(),
              icon: const Icon(Icons.refresh),
            ),
          if (controller != null)
            IconButton(
              tooltip: 'Ganti server',
              onPressed: _changeServer,
              icon: const Icon(Icons.dns_outlined),
            ),
        ],
      ),
      body: controller == null ? _serverForm() : Stack(
        children: [
          WebViewWidget(controller: controller),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null) _errorBanner(),
        ],
      ),
    );
  }

  Widget _serverForm() => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.forum_rounded, size: 64, color: Color(0xFF6C35DE)),
                const SizedBox(height: 16),
                Text('Hubungkan ke server Chat Global', style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
                const SizedBox(height: 8),
                const Text('Deploy backend Node.js terlebih dahulu, lalu masukkan alamat HTTPS server kamu.', textAlign: TextAlign.center),
                const SizedBox(height: 20),
                TextField(
                  controller: _urlController,
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                  decoration: const InputDecoration(labelText: 'Alamat server', hintText: 'https://chat.example.com', border: OutlineInputBorder()),
                  onSubmitted: _openServer,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 16),
                FilledButton(onPressed: _loading ? null : () => _openServer(_urlController.text), child: const Text('Hubungkan')),
                if (_loading) const Padding(padding: EdgeInsets.only(top: 16), child: Center(child: CircularProgressIndicator())),
              ],
            ),
          ),
        ),
      );

  Widget _errorBanner() => Align(
        alignment: Alignment.topCenter,
        child: Material(
          color: Theme.of(context).colorScheme.errorContainer,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Expanded(child: Text(_error!)),
              IconButton(onPressed: () => setState(() => _error = null), icon: const Icon(Icons.close)),
            ]),
          ),
        ),
      );
}
