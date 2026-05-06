package com.converge.mobile

import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.converge.mobile.ui.MainTab
import com.converge.mobile.ui.MainUiState
import com.converge.mobile.ui.MainViewModel
import com.converge.mobile.ui.components.ErrorBanner
import com.converge.mobile.ui.components.NetworkBanner
import com.converge.mobile.ui.screens.FavoritesScreen
import com.converge.mobile.ui.screens.IssueDetailScreen
import com.converge.mobile.ui.screens.IssueListScreen
import com.converge.mobile.ui.screens.SettingsScreen
import com.converge.mobile.ui.theme.ConvergeTheme

class MainActivity : ComponentActivity() {
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var viewModelRef: MainViewModel? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            ConvergeTheme {
                val viewModel: MainViewModel = viewModel()
                viewModelRef = viewModel
                ConvergeApp(viewModel)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        val cm = getSystemService(ConnectivityManager::class.java)
        val mainHandler = Handler(Looper.getMainLooper())
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                mainHandler.post { viewModelRef?.setOffline(false) }
            }
            override fun onLost(network: Network) {
                mainHandler.post { viewModelRef?.setOffline(true) }
            }
        }
        networkCallback = callback
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        cm.registerNetworkCallback(request, callback)
        val active = cm.getNetworkCapabilities(cm.activeNetwork)
        viewModelRef?.setOffline(active == null || !active.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))
    }

    override fun onPause() {
        super.onPause()
        networkCallback?.let { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) }
        networkCallback = null
    }
}

@Composable
private fun ConvergeApp(viewModel: MainViewModel) {
    val state by viewModel.state
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when {
            !state.isPaired -> PairScreen(state, viewModel)
            state.selectedIssue != null -> IssueDetailScreen(state, viewModel)
            else -> MainScaffold(state, viewModel)
        }
    }
}

@Composable
private fun MainScaffold(state: MainUiState, viewModel: MainViewModel) {
    Scaffold(
        bottomBar = {
            Column {
                NetworkBanner(state.isOffline)
                NavigationBar {
                    NavigationBarItem(
                        selected = state.currentTab == MainTab.ISSUES,
                        onClick = { viewModel.switchTab(MainTab.ISSUES) },
                        icon = { Icon(Icons.Default.Checklist, contentDescription = null) },
                        label = { Text("Issues") },
                    )
                    NavigationBarItem(
                        selected = state.currentTab == MainTab.FAVORITES,
                        onClick = { viewModel.switchTab(MainTab.FAVORITES) },
                        icon = { Icon(Icons.Default.Star, contentDescription = null) },
                        label = { Text("Favorites") },
                    )
                    NavigationBarItem(
                        selected = state.currentTab == MainTab.SETTINGS,
                        onClick = { viewModel.switchTab(MainTab.SETTINGS) },
                        icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                        label = { Text("Settings") },
                    )
                }
            }
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            when (state.currentTab) {
                MainTab.ISSUES -> IssueListScreen(state, viewModel)
                MainTab.FAVORITES -> FavoritesScreen(state, viewModel)
                MainTab.SETTINGS -> SettingsScreen(state, viewModel)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PairScreen(state: MainUiState, viewModel: MainViewModel) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Converge", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 24.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            Spacer(Modifier.height(32.dp))
            Icon(
                Icons.Default.Language,
                contentDescription = null,
                modifier = Modifier.size(48.dp).align(Alignment.CenterHorizontally),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "Connect Device",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
            Text(
                "Pair with your Converge server to access issues on the go.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 6.dp, bottom = 28.dp),
            )

            ErrorBanner(state.errorMessage, viewModel::clearError)
            if (state.errorMessage != null) Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = state.serverUrl,
                onValueChange = viewModel::updateServerUrl,
                label = { Text("Converge server URL") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.redmineBaseUrl,
                onValueChange = viewModel::updateRedmineBaseUrl,
                label = { Text("Redmine base URL") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.redmineApiKey,
                onValueChange = viewModel::updateRedmineApiKey,
                label = { Text("Redmine API key") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.deviceName,
                onValueChange = viewModel::updateDeviceName,
                label = { Text("Device name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = viewModel::pairDevice,
                enabled = !state.isLoading,
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) {
                Text(if (state.isLoading) "Pairing…" else "Pair Device", style = MaterialTheme.typography.labelLarge)
            }
            if (state.isLoading) {
                Spacer(Modifier.height(12.dp))
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
