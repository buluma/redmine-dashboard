package com.nrcc.mobile.di

import com.nrcc.mobile.auth.AuthInterceptor
import com.nrcc.mobile.auth.AuthTokenStore
import com.nrcc.mobile.network.NrccApi
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

object NetworkModule {
    fun createNrccApi(
        baseUrl: String,
        tokenStore: AuthTokenStore
    ): NrccApi {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenStore))
            .addInterceptor(logging)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(NrccApi::class.java)
    }
}
