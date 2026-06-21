package com.harbormart.auth.controller;

import com.harbormart.auth.constants.AppConstants;
import com.harbormart.auth.dto.ApiResponse;
import com.harbormart.auth.dto.AuthRequest;
import com.harbormart.auth.dto.AuthResponse;
import com.harbormart.auth.dto.RegisterRequest;
import com.harbormart.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> authenticateUser(@Valid @RequestBody AuthRequest loginRequest) {
        AuthResponse data = authService.authenticateUser(loginRequest);
        ApiResponse<AuthResponse> response = ApiResponse.<AuthResponse>builder()
                .data(data)
                .message(AppConstants.SUCCESS_LOGIN)
                .error(false)
                .status(HttpStatus.OK.value())
                .build();
        return ResponseEntity.ok(response);
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<Void>> registerUser(@Valid @RequestBody RegisterRequest signUpRequest) {
        authService.registerUser(signUpRequest);
        ApiResponse<Void> response = ApiResponse.<Void>builder()
                .data(null)
                .message(AppConstants.SUCCESS_REGISTER)
                .error(false)
                .status(HttpStatus.OK.value())
                .build();
        return ResponseEntity.ok(response);
    }
}
